import type { FileSystem } from "@/lib/file-system/file-system";
import { decodeTextOrNull } from "@/lib/file-system/transfer";
import type { WorkspaceFs } from "@/features/assistant/tools/paths";
import {
  captureProject,
  restoreWithUndo,
  type CheckpointFile,
  type CheckpointStore,
} from "@/features/assistant/rounds/checkpoints";
import { isContractFile } from "@/features/project/contract";
import { uniqueName } from "@/features/project/file-naming";
import { gitBlobSha } from "@/lib/git-sync/blob-sha";
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
import {
  localChanges,
  planPull,
  resolvePull,
  syncState,
  type Conflict,
  type PullAction,
  type Shas,
  type SyncState,
} from "@/lib/git-sync/plan";
import type { BranchHead, GitProvider, RepoRef, TreeEntry } from "@/lib/git-sync/provider";
import type { RepoLink, RepoLinks } from "@/lib/git-sync/repo-links";
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

export interface PreparedPull {
  projectId: string;
  head: BranchHead;
  /** The marker at the link's path in `head`; becomes the link's marker on apply. */
  marker: Marker;
  remote: Shas;
  local: Shas;
  actions: PullAction[];
  conflicts: Conflict[];
  /** Remote text for every write action and every conflict with a remote side. */
  remoteText: Record<string, string>;
  skipped: string[];
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
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const toText = (content: unknown) => (typeof content === "string" ? content : String(content ?? ""));

/** The marker if this Studio can work with it; throws invalid_marker / format_unsupported otherwise. */
function supportedMarker(marker: Marker | null, error?: string): Marker {
  if (!marker) throw new GitSyncError("invalid_marker", error ?? "Invalid marker.");
  if (marker.format > SUPPORTED_FORMAT) {
    throw new GitSyncError("format_unsupported", "This repo needs a newer Studio.");
  }
  return marker;
}

function sameShas(a: Shas, b: Shas): boolean {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((k) => Object.hasOwn(b, k) && a[k] === b[k]);
}

export class GitSync {
  private readonly undos = new Map<
    string,
    { projectId: string; checkpointId: string; previousLink: RepoLink }
  >();

  constructor(private readonly deps: GitSyncDeps) {}

  async probe(ref: RepoRef, branch: string): Promise<RepoProbe> {
    return (await this.read(ref, branch)).probe;
  }

  async importProject(ref: RepoRef, branch: string, folder: string) {
    const { probe, head, entries } = await this.read(ref, branch);
    if (!head) throw new GitSyncError("not_found", `Branch ${branch} not found.`);
    const hasNestedBelow = probe.markers.some((m) => m.folder !== folder && isBelow(m.folder, folder));
    if (probe.nested.includes(folder) || hasNestedBelow) {
      throw new GitSyncError("nested_markers", "Markers may not be nested.");
    }
    const found = probe.markers.find((m) => m.folder === folder);
    if (!found) throw new GitSyncError("no_marker", "This folder has no SmartC Studio marker.");
    const marker = supportedMarker(found.marker, found.error);

    const { files, skipped, texts } = await this.selectRemote(ref, entries, folder);

    const fs = this.deps.fs;
    const rootNames = fs.listFolderContents(fs.rootFolderId).folders.map((f) => f.metadata.name);
    const base = folder === "" ? ref.repo : folder.slice(folder.lastIndexOf("/") + 1);
    const projectId = await fs.createFolder(fs.rootFolderId, uniqueName(base, rootNames));
    const { imported } = await fs.transfer.importEntries(
      projectId,
      files.map((f) => ({ path: f.relPath, content: texts.get(f.sha)! })),
      trackedType,
    );

    const baseFiles: Shas = {};
    for (const f of files) baseFiles[f.relPath] = f.sha;
    this.deps.links.set(projectId, {
      provider: "github",
      owner: ref.owner,
      repo: ref.repo,
      branch,
      path: folder,
      marker,
      baseCommit: head.commit,
      baseFiles,
    });
    return { projectId, imported, skipped };
  }

  async initialize(ref: RepoRef, branch: string | null, folder: string): Promise<void> {
    const git = this.deps.provider();
    const path = markerPath(folder);
    let sha: string | undefined;
    if (branch !== null) {
      const head = await git.getHead(ref, branch);
      if (head) {
        const existing = (await git.getTree(ref, head.tree)).find((e) => e.path === path);
        if (existing) {
          const text = new TextDecoder().decode(await git.getBlob(ref, existing.sha));
          if (parseMarker(text).ok) return; // a valid marker is never overwritten
          sha = existing.sha;
        }
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

  /** Blob SHAs of the project's tracked files, keyed by path relative to the project. Flushes first. */
  async localShas(projectId: string): Promise<Shas> {
    await this.deps.flush();
    const shas: Shas = {};
    for (const f of await captureProject(this.deps.fs, projectId)) {
      if (trackedType(baseName(f.relPath)) === null) continue;
      shas[f.relPath] = await gitBlobSha(toText(f.content));
    }
    return shas;
  }

  /** `remoteAhead` is null unless `remote` is set and the head could be read. */
  async status(
    projectId: string,
    opts: { remote?: boolean } = {},
  ): Promise<{ state: SyncState; localChanges: number; remoteAhead: boolean | null }> {
    const link = this.link(projectId);
    const { upserts, deletes } = localChanges(link.baseFiles, await this.localShas(projectId));
    let remoteAhead: boolean | null = null;
    if (opts.remote) {
      try {
        const head = await this.deps.provider().getHead(this.refOf(link), link.branch);
        remoteAhead = head?.commit !== link.baseCommit;
      } catch {
        remoteAhead = null;
      }
    }
    const count = upserts.length + deletes.length;
    return { state: syncState(count, remoteAhead ?? false), localChanges: count, remoteAhead };
  }

  /** null = the branch head has not moved since the last sync. */
  async preparePull(projectId: string): Promise<PreparedPull | null> {
    this.assertUnlocked(projectId);
    const link = this.link(projectId);
    const ref = this.refOf(link);
    const git = this.deps.provider();
    const head = await git.getHead(ref, link.branch);
    if (!head) throw new GitSyncError("not_found", `Branch ${link.branch} not found.`);
    if (head.commit === link.baseCommit) return null;

    const entries = await git.getTree(ref, head.tree);
    const markerEntry = entries.find((e) => e.type === "blob" && e.path === markerPath(link.path));
    if (!markerEntry) throw new GitSyncError("no_marker", "This folder has no SmartC Studio marker.");
    const parsed = parseMarker(new TextDecoder().decode(await git.getBlob(ref, markerEntry.sha)));
    const marker = parsed.ok ? supportedMarker(parsed.marker) : supportedMarker(null, parsed.error);

    const local = await this.localShas(projectId);
    const knownText = new Set([...Object.values(link.baseFiles), ...Object.values(local)]);
    const { files, skipped, texts } = await this.selectRemote(ref, entries, link.path, {
      knownText,
      preferred: link.baseFiles,
    });
    const remote: Shas = {};
    for (const f of files) remote[f.relPath] = f.sha;
    const { actions, conflicts } = planPull(link.baseFiles, local, remote);
    const remoteText: Record<string, string> = {};
    for (const { relPath } of [...actions.filter((a) => a.kind === "write"), ...conflicts]) {
      if (Object.hasOwn(remote, relPath)) remoteText[relPath] = texts.get(remote[relPath])!;
    }
    return { projectId, head, marker, remote, local, actions, conflicts, remoteText, skipped };
  }

  async applyPull(
    prepared: PreparedPull,
    choices: Record<string, "mine" | "theirs">,
  ): Promise<{ undoToken: string; written: string[]; deleted: string[] }> {
    const { projectId } = prepared;
    this.assertUnlocked(projectId);
    const previousLink = this.link(projectId);
    const actions = resolvePull(prepared, choices, prepared.remote);
    if (!sameShas(await this.localShas(projectId), prepared.local)) {
      throw new GitSyncError("stale", "Local files changed since the pull was prepared.");
    }

    const { fs, checkpoints: store, clock } = this.deps;
    const files = new Map<string, CheckpointFile>(
      (await captureProject(fs, projectId)).map((f) => [f.relPath, f]),
    );
    for (const action of actions) {
      if (action.kind === "delete") {
        files.delete(action.relPath);
      } else {
        const type = files.get(action.relPath)?.type ?? trackedType(baseName(action.relPath))!;
        files.set(action.relPath, { relPath: action.relPath, type, content: prepared.remoteText[action.relPath] });
      }
    }
    const { undoCheckpointId } = await restoreWithUndo({ fs, store, clock }, projectId, {
      id: crypto.randomUUID(),
      projectId,
      createdAt: clock.now(),
      reason: "before-restore",
      files: [...files.values()],
    });

    this.deps.links.set(projectId, {
      ...previousLink,
      baseCommit: prepared.head.commit,
      baseFiles: prepared.remote,
      marker: prepared.marker,
    });
    const undoToken = crypto.randomUUID();
    this.undos.set(undoToken, { projectId, checkpointId: undoCheckpointId, previousLink });
    this.deps.markTookOver(projectId);
    return {
      undoToken,
      written: actions.filter((a) => a.kind === "write").map((a) => a.relPath),
      deleted: actions.filter((a) => a.kind === "delete").map((a) => a.relPath),
    };
  }

  /** Puts back the files and the link as they were before the pull. */
  async undoPull(undoToken: string): Promise<void> {
    const undo = this.undos.get(undoToken);
    if (!undo) throw new Error("Unknown undo token.");
    const { projectId, checkpointId, previousLink } = undo;
    this.assertUnlocked(projectId);
    const { fs, checkpoints: store, clock } = this.deps;
    const checkpoint = await store.get(checkpointId);
    if (!checkpoint) throw new Error("The undo checkpoint is gone.");
    await this.deps.flush();
    await restoreWithUndo({ fs, store, clock }, projectId, checkpoint);
    this.deps.links.set(projectId, previousLink);
    this.undos.delete(undoToken);
    this.deps.markTookOver(projectId);
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

  /**
   * The remote files a project tracks below `folder`: text only, and at most one contract
   * (the one in `preferred`, else the first by path). Everything else lands in `skipped`.
   * Blobs whose sha is in `knownText` are not fetched; `texts` maps every fetched sha to its text.
   */
  private async selectRemote(
    ref: RepoRef,
    entries: TreeEntry[],
    folder: string,
    opts: { knownText?: Set<string>; preferred?: Shas } = {},
  ) {
    const { tracked, skipped } = selectTracked(entries, folder, trackedType);
    const git = this.deps.provider();
    const toFetch = [...new Set(tracked.map((t) => t.sha))].filter((sha) => !opts.knownText?.has(sha));
    const texts = new Map<string, string>();
    const binary = new Set<string>();
    await mapLimit(toFetch, MAX_BLOBS_IN_FLIGHT, async (sha) => {
      const text = decodeTextOrNull(await git.getBlob(ref, sha));
      if (text === null) binary.add(sha);
      else texts.set(sha, text);
    });
    const text = tracked.filter((t) => !binary.has(t.sha));
    skipped.push(...tracked.filter((t) => binary.has(t.sha)).map((t) => t.relPath));

    // A project holds one contract (FileTransfer.importEntries enforces it on import only).
    const contracts = text.filter((t) => isContractFile(baseName(t.relPath))).map((t) => t.relPath).sort();
    const preferred = opts.preferred;
    const keep = contracts.find((p) => preferred && Object.hasOwn(preferred, p)) ?? contracts[0];
    skipped.push(...contracts.filter((p) => p !== keep));
    const files = text.filter((t) => !isContractFile(baseName(t.relPath)) || t.relPath === keep);
    return { files, skipped: skipped.sort(), texts };
  }

  private link(projectId: string): RepoLink {
    const link = this.deps.links.get(projectId);
    if (!link) throw new GitSyncError("not_found", "This project is not linked to a repository.");
    return link;
  }

  private refOf(link: RepoLink): RepoRef {
    return { owner: link.owner, repo: link.repo };
  }

  private assertUnlocked(projectId: string): void {
    if (this.deps.isLocked(projectId)) {
      throw new GitSyncError("locked", "The assistant is working on this project.");
    }
  }
}
