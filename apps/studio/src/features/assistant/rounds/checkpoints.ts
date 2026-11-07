import type { WorkspaceFs } from "../tools/paths";
import type { Clock } from "./round-tracker";

export interface CheckpointFile {
  relPath: string;
  type: string;
  content: unknown;
}

export interface Checkpoint {
  id: string;
  projectId: string;
  createdAt: number;
  reason: "round-start" | "before-restore";
  files: CheckpointFile[];
}

export interface CheckpointStore {
  put(cp: Checkpoint): Promise<void>;
  get(id: string): Promise<Checkpoint | undefined>;
  /** Newest first. */
  list(projectId: string): Promise<Checkpoint[]>;
  /** Keeps the newest `keep` checkpoints of the project. */
  prune(projectId: string, keep: number): Promise<void>;
}

export const MAX_CHECKPOINTS = 20;

export class MemoryCheckpointStore implements CheckpointStore {
  private readonly byId = new Map<string, Checkpoint>();
  /* Timestamps can tie (coarse clocks), so insertion order decides "newest". */
  private readonly seq = new Map<string, number>();
  private counter = 0;

  async put(cp: Checkpoint) {
    this.byId.set(cp.id, cp);
    this.seq.set(cp.id, this.counter++);
  }
  async get(id: string) {
    return this.byId.get(id);
  }
  async list(projectId: string) {
    return [...this.byId.values()].filter((c) => c.projectId === projectId).sort((a, b) => b.createdAt - a.createdAt || this.seq.get(b.id)! - this.seq.get(a.id)!);
  }
  async prune(projectId: string, keep: number) {
    for (const old of (await this.list(projectId)).slice(keep)) {
      this.byId.delete(old.id);
      this.seq.delete(old.id);
    }
  }
}

function sameContent(a: unknown, b: unknown): boolean {
  if (typeof a === "string" || typeof b === "string") return a === b;
  return JSON.stringify(a) === JSON.stringify(b);
}

/* Paths in a snapshot are relative to the project so a restore survives file ids changing. */
function relativeTo(projectPath: string, path: string): string {
  return path.slice(projectPath.length).replace(/^\//, "");
}

export async function captureProject(fs: WorkspaceFs, projectId: string): Promise<CheckpointFile[]> {
  const projectPath = fs.getFolder(projectId).path;
  const files: CheckpointFile[] = [];
  for (const meta of fs.listFilesRecursive(projectId)) {
    const { content } = await fs.loadFile<unknown>(meta.id);
    files.push({ relPath: relativeTo(projectPath, meta.path), type: meta.type, content });
  }
  return files;
}

export function diffSnapshots(
  before: CheckpointFile[],
  after: CheckpointFile[],
): { added: string[]; removed: string[]; changed: string[] } {
  const was = new Map(before.map((f) => [f.relPath, f]));
  const is = new Map(after.map((f) => [f.relPath, f]));
  return {
    added: [...is.keys()].filter((k) => !was.has(k)),
    removed: [...was.keys()].filter((k) => !is.has(k)),
    changed: [...is.keys()].filter((k) => was.has(k) && !sameContent(was.get(k)!.content, is.get(k)!.content)),
  };
}

/*
 * Only files whose content differs are rewritten, so `lastModified` and open editors
 * stay put for everything the round never touched. Restored files get fresh ids; the
 * project's verdicts do not survive that, which is acceptable.
 */
export async function restoreProject(
  fs: WorkspaceFs,
  projectId: string,
  target: CheckpointFile[],
): Promise<{ written: string[]; created: string[]; deleted: string[] }> {
  const projectPath = fs.getFolder(projectId).path;
  const current = new Map(
    await Promise.all(
      fs.listFilesRecursive(projectId).map(async (meta) => {
        const { content } = await fs.loadFile<unknown>(meta.id);
        return [relativeTo(projectPath, meta.path), { id: meta.id, content }] as const;
      }),
    ),
  );
  const wanted = new Map(target.map((f) => [f.relPath, f]));

  const written: string[] = [];
  const created: string[] = [];
  const deleted: string[] = [];

  for (const [relPath, file] of current) {
    if (!wanted.has(relPath)) {
      await fs.deleteFile(file.id);
      deleted.push(relPath);
    }
  }

  const folderIds = new Map<string, string>([["", projectId]]);
  const ensureFolder = async (dir: string): Promise<string> => {
    const known = folderIds.get(dir);
    if (known) return known;
    const slash = dir.lastIndexOf("/");
    const parentId = await ensureFolder(slash < 0 ? "" : dir.slice(0, slash));
    const name = dir.slice(slash + 1);
    const existing = fs.listFolderContents(parentId).folders.find((f) => f.metadata.name === name);
    const id = existing ? existing.id : await fs.createFolder(parentId, name);
    folderIds.set(dir, id);
    return id;
  };

  for (const file of target) {
    const have = current.get(file.relPath);
    if (have) {
      if (!sameContent(have.content, file.content)) {
        await fs.saveFile(have.id, file.content);
        written.push(file.relPath);
      }
      continue;
    }
    const slash = file.relPath.lastIndexOf("/");
    const folderId = await ensureFolder(slash < 0 ? "" : file.relPath.slice(0, slash));
    await fs.addFile(folderId, file.relPath.slice(slash + 1), file.type, file.content);
    created.push(file.relPath);
  }

  return { written: written.sort(), created: created.sort(), deleted: deleted.sort() };
}

/* The undo checkpoint is stored before anything is touched, so a failed restore can still be undone. */
export async function restoreWithUndo(
  deps: { fs: WorkspaceFs; store: CheckpointStore; clock: Clock },
  projectId: string,
  target: Checkpoint,
): Promise<{ undoCheckpointId: string }> {
  const undo: Checkpoint = {
    id: crypto.randomUUID(),
    projectId,
    createdAt: deps.clock.now(),
    reason: "before-restore",
    files: await captureProject(deps.fs, projectId),
  };
  await deps.store.put(undo);
  await restoreProject(deps.fs, projectId, target.files);
  await deps.store.prune(projectId, MAX_CHECKPOINTS);
  return { undoCheckpointId: undo.id };
}

/** Files that differ from the snapshot taken when the round ended, i.e. the user's own edits. */
export async function userChangesSince(
  fs: WorkspaceFs,
  projectId: string,
  endSnapshot: CheckpointFile[],
): Promise<string[]> {
  const { added, removed, changed } = diffSnapshots(endSnapshot, await captureProject(fs, projectId));
  return [...added, ...removed, ...changed].sort();
}
