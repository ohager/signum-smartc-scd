import type { FileSystem } from "@/lib/file-system/file-system";
import { decodeTextOrNull } from "@/lib/file-system/transfer";
import type { WorkspaceFs } from "@/features/assistant/tools/paths";
import type { CheckpointStore } from "@/features/assistant/rounds/checkpoints";
import { uniqueName } from "@/features/project/file-naming";
import { GitSyncError } from "@/lib/git-sync/errors";
import {
  findMarkerFolders,
  MARKER_FILE,
  markerPath,
  parseMarker,
  serializeMarker,
  SUPPORTED_FORMAT,
  type Marker,
} from "@/lib/git-sync/marker";
import type { Shas } from "@/lib/git-sync/plan";
import type { GitProvider, RepoRef, TreeEntry } from "@/lib/git-sync/provider";
import type { RepoLinks } from "@/lib/git-sync/repo-links";
import { selectTracked } from "@/lib/git-sync/tracked";
import { trackedType } from "./tracked-type";

export type SyncFs = WorkspaceFs & Pick<FileSystem, "transfer">;

export interface GitSyncDeps {
  fs: SyncFs;
  links: RepoLinks;
  /** Throws GitSyncError("no_token") without a token. */
  provider: () => GitProvider;
  checkpoints: CheckpointStore;
  clock: { now(): number };
  flush(): Promise<void>;
  isLocked(projectId: string): boolean;
  markTookOver(projectId: string): void;
}

export interface RepoProbe {
  branches: string[];
  defaultBranch: string;
  canPush: boolean;
  /** marker null + error: the marker file exists but is invalid. */
  markers: { folder: string; marker: Marker | null; error?: string }[];
  nested: string[];
  folderStats(folder: string): { tracked: number; skipped: number };
}

const MAX_BLOBS_IN_FLIGHT = 8;
const INIT_MESSAGE = "Initialize SmartC Studio project";

/** Runs `fn` over `items` with at most `limit` calls in flight; results keep input order. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

const isBelow = (path: string, folder: string) => folder === "" || path.startsWith(`${folder}/`);

export class GitSync {
  constructor(private readonly deps: GitSyncDeps) {}

  async probe(ref: RepoRef, branch: string): Promise<RepoProbe> {
    return (await this.read(ref, branch)).probe;
  }

  async importProject(ref: RepoRef, branch: string, folder: string) {
    const { provider } = this.deps;
    const { probe, head, entries } = await this.read(ref, branch);
    if (!head) throw new GitSyncError("not_found", `Branch ${branch} not found.`);
    const hasNestedBelow = probe.markers.some((m) => m.folder !== folder && isBelow(m.folder, folder));
    if (probe.nested.includes(folder) || hasNestedBelow) {
      throw new GitSyncError("nested_markers", "Markers may not be nested.");
    }
    const found = probe.markers.find((m) => m.folder === folder);
    if (!found) throw new GitSyncError("no_marker", "This folder has no SmartC Studio marker.");
    if (!found.marker) throw new GitSyncError("invalid_marker", found.error ?? "Invalid marker.");
    if (found.marker.format > SUPPORTED_FORMAT) {
      throw new GitSyncError("format_unsupported", "This repo needs a newer Studio.");
    }

    const { tracked, skipped } = selectTracked(entries, folder, trackedType);
    const git = provider();
    const fetched = await mapLimit(tracked, MAX_BLOBS_IN_FLIGHT, async (t) => ({
      ...t,
      text: decodeTextOrNull(await git.getBlob(ref, t.sha)),
    }));
    const texts = fetched.filter((f): f is typeof f & { text: string } => f.text !== null);
    skipped.push(...fetched.filter((f) => f.text === null).map((f) => f.relPath));

    const fs = this.deps.fs;
    const rootNames = fs.listFolderContents(fs.rootFolderId).folders.map((f) => f.metadata.name);
    const base = folder === "" ? ref.repo : folder.slice(folder.lastIndexOf("/") + 1);
    const projectId = await fs.createFolder(fs.rootFolderId, uniqueName(base, rootNames));
    const { imported } = await fs.transfer.importEntries(
      projectId,
      texts.map((f) => ({ path: f.relPath, content: f.text })),
      trackedType,
    );

    const baseFiles: Shas = {};
    for (const f of texts) baseFiles[f.relPath] = f.sha;
    this.deps.links.set(projectId, {
      provider: "github",
      owner: ref.owner,
      repo: ref.repo,
      branch,
      path: folder,
      marker: found.marker,
      baseCommit: head.commit,
      baseFiles,
    });
    return { projectId, imported, skipped: skipped.sort() };
  }

  async initialize(ref: RepoRef, branch: string | null, folder: string): Promise<void> {
    const git = this.deps.provider();
    const path = markerPath(folder);
    let sha: string | undefined;
    if (branch !== null) {
      const head = await git.getHead(ref, branch);
      if (head) {
        const existing = (await git.getTree(ref, head.tree)).find((e) => e.path === path);
        if (existing) sha = existing.sha;
      }
    }
    await git.putFile(ref, {
      path,
      text: serializeMarker({ format: SUPPORTED_FORMAT }),
      message: INIT_MESSAGE,
      ...(branch !== null ? { branch } : {}),
      ...(sha ? { sha } : {}),
    });
  }

  /** Head, tree and parsed markers of a branch; an empty repo or missing branch gives an empty probe. */
  private async read(ref: RepoRef, branch: string) {
    const git = this.deps.provider();
    const [repoInfo, branches] = await Promise.all([git.getRepo(ref), git.listBranches(ref)]);
    const head = branches.length === 0 ? null : await git.getHead(ref, branch);
    const entries: TreeEntry[] = head ? await git.getTree(ref, head.tree) : [];
    const paths = entries.filter((e) => e.type === "blob").map((e) => e.path);
    const { folders, nested } = findMarkerFolders(paths);
    const markers = await Promise.all(
      folders.map(async (folder) => {
        const entry = entries.find((e) => e.path === markerPath(folder))!;
        const result = parseMarker(new TextDecoder().decode(await git.getBlob(ref, entry.sha)));
        return result.ok
          ? { folder, marker: result.marker }
          : { folder, marker: null, error: result.error };
      }),
    );
    const probe: RepoProbe = {
      branches,
      defaultBranch: repoInfo.defaultBranch,
      canPush: repoInfo.canPush,
      markers,
      nested,
      folderStats: (folder) => {
        const inner = folders.filter((f) => f !== folder && f !== "" && isBelow(f, folder));
        const own = entries.filter((e) => !inner.some((f) => isBelow(e.path, f)));
        const { tracked, skipped } = selectTracked(own, folder, trackedType);
        return { tracked: tracked.length, skipped: skipped.filter((p) => !p.endsWith(MARKER_FILE)).length };
      },
    };
    return { probe, head, entries };
  }
}
