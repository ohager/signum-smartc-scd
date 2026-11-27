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
import { selectTracked, toRepoPath } from "@/lib/git-sync/tracked";
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
  /** Every folder of the branch, repo root ("") first, sorted by path. */
  folders: string[];
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

/** Folder paths of a tree: the root plus every directory entry and every parent of a blob. */
function repoFolders(blobPaths: string[], entries: TreeEntry[]): string[] {
  const out = new Set<string>([""]);
  for (const e of entries) if (e.type === "tree") out.add(e.path);
  for (const p of blobPaths) {
    for (let i = p.indexOf("/"); i !== -1; i = p.indexOf("/", i + 1)) out.add(p.slice(0, i));
  }
  return [...out].sort();
}

const isBelow = (path: string, folder: string) => folder === "" || path.startsWith(`${folder}/`);
const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);
const toText = (content: unknown) => (typeof content === "string" ? content : String(content ?? ""));

/** Throws nested_markers if `folder` lies below another marker folder or holds one below it. */
function assertNotNested(folders: string[], nested: string[], folder: string): void {
  const hasNestedBelow = folders.some((f) => f !== folder && isBelow(f, folder));
  if (nested.includes(folder) || hasNestedBelow) {
    throw new GitSyncError("nested_markers", "Markers may not be nested.");
  }
}

const countContracts = (relPaths: Iterable<string>) =>
  [...relPaths].filter((p) => isContractFile(baseName(p))).length;

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
    { projectId: string; checkpointId: string; previousLink: RepoLink; afterPull: Shas }
  >();

  constructor(private readonly deps: GitSyncDeps) {}

  async probe(ref: RepoRef, branch: string): Promise<RepoProbe> {
    return (await this.read(ref, branch)).probe;
  }

  async importProject(ref: RepoRef, branch: string, folder: string) {
    const { probe, head, entries } = await this.read(ref, branch);
    if (!head) throw new GitSyncError("not_found", `Branch ${branch} not found.`);
    assertNotNested(probe.markers.map((m) => m.folder), probe.nested, folder);
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
    return (await this.localFiles(projectId)).shas;
  }

  /** `localShas` plus the text behind each sha. */
  private async localFiles(projectId: string): Promise<{ shas: Shas; texts: Map<string, string> }> {
    await this.deps.flush();
    const shas: Shas = {};
    const texts = new Map<string, string>();
    for (const f of await captureProject(this.deps.fs, projectId)) {
      if (trackedType(baseName(f.relPath)) === null) continue;
      const text = toText(f.content);
      shas[f.relPath] = await gitBlobSha(text);
      texts.set(shas[f.relPath], text);
    }
    return { shas, texts };
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
    const { folders, nested } = findMarkerFolders(entries.filter((e) => e.type === "blob").map((e) => e.path));
    assertNotNested(folders, nested, link.path);
    const markerEntry = entries.find((e) => e.type === "blob" && e.path === markerPath(link.path));
    if (!markerEntry) throw new GitSyncError("no_marker", "This folder has no SmartC Studio marker.");
    const parsed = parseMarker(new TextDecoder().decode(await git.getBlob(ref, markerEntry.sha)));
    const marker = parsed.ok ? supportedMarker(parsed.marker) : supportedMarker(null, parsed.error);

    const { shas: local, texts: localTexts } = await this.localFiles(projectId);
    const { files, skipped, texts } = await this.selectRemote(ref, entries, link.path, {
      knownText: localTexts,
      base: link.baseFiles,
      local,
    });
    const remote: Shas = {};
    for (const f of files) remote[f.relPath] = f.sha;
    const { actions, conflicts } = planPull(link.baseFiles, local, remote);
    const remoteText: Record<string, string> = {};
    for (const { relPath } of [...actions.filter((a) => a.kind === "write"), ...conflicts]) {
      if (!Object.hasOwn(remote, relPath)) continue;
      const text = texts.get(remote[relPath]);
      if (text === undefined) throw new Error(`No remote text for ${relPath}.`);
      remoteText[relPath] = text;
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

    for (const a of actions) {
      if (a.kind === "write" && !Object.hasOwn(prepared.remoteText, a.relPath)) {
        throw new Error(`No remote text for ${a.relPath}.`);
      }
    }

    const { fs, checkpoints: store, clock } = this.deps;
    const files = new Map<string, CheckpointFile>(
      (await captureProject(fs, projectId)).map((f) => [f.relPath, f]),
    );
    const contractsBefore = countContracts(files.keys());
    for (const action of actions) {
      if (action.kind === "delete") {
        files.delete(action.relPath);
      } else {
        const type = files.get(action.relPath)?.type ?? trackedType(baseName(action.relPath))!;
        files.set(action.relPath, { relPath: action.relPath, type, content: prepared.remoteText[action.relPath] });
      }
    }
    // One contract per project; a workspace that already breaks the rule may keep its count.
    const contractsAfter = countContracts(files.keys());
    if (contractsAfter > 1 && contractsAfter > contractsBefore) {
      throw new GitSyncError("multiple_contracts", "The pull would leave this project with more than one contract.");
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
    const afterPull = await this.localShas(projectId);
    this.undos.set(undoToken, { projectId, checkpointId: undoCheckpointId, previousLink, afterPull });
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
    const { projectId, checkpointId, previousLink, afterPull } = undo;
    this.assertUnlocked(projectId);
    const { fs, checkpoints: store, clock } = this.deps;
    const checkpoint = await store.get(checkpointId);
    if (!checkpoint) throw new Error("The undo checkpoint is gone.");
    if (!sameShas(await this.localShas(projectId), afterPull)) {
      throw new GitSyncError("stale", "Files changed since the pull; undo would overwrite them.");
    }
    await restoreWithUndo({ fs, store, clock }, projectId, checkpoint);
    this.deps.links.set(projectId, previousLink);
    this.undos.delete(undoToken);
    this.deps.markTookOver(projectId);
  }

  /** Local changes against the last synced state, for the commit dialog. */
  async pendingChanges(projectId: string): Promise<{ upserts: string[]; deletes: string[] }> {
    return localChanges(this.link(projectId).baseFiles, await this.localShas(projectId));
  }

  /**
   * Commits the local changes on top of the base commit and fast-forwards the branch.
   * The commit builds on the head tree, so remote files the link does not track stay
   * untouched; a local file at the path of one (e.g. a skipped binary) is left out.
   */
  async push(projectId: string, message: string): Promise<{ commit: string }> {
    this.assertUnlocked(projectId);
    const link = this.link(projectId);
    const { shas: local, texts } = await this.localFiles(projectId);
    const { upserts, deletes } = localChanges(link.baseFiles, local);
    if (upserts.length + deletes.length === 0) throw new GitSyncError("nothing_to_push", "Nothing to push.");

    const ref = this.refOf(link);
    const git = this.deps.provider();
    const head = await git.getHead(ref, link.branch);
    if (!head || head.commit !== link.baseCommit) {
      throw new GitSyncError("not_fast_forward", "The branch moved on GitHub — pull first.");
    }
    // At the base commit every remote path outside baseFiles is untracked or skipped.
    const remotePaths = new Set((await git.getTree(ref, head.tree)).map((e) => e.path));
    const taken = upserts.filter(
      (p) => !Object.hasOwn(link.baseFiles, p) && remotePaths.has(toRepoPath(link.path, p)),
    );
    if (taken.length > 0) {
      throw new GitSyncError(
        "path_taken",
        `GitHub already has files Studio does not sync at ${taken.join(", ")} — rename them, then push again.`,
        { paths: taken },
      );
    }

    const blobs = await mapLimit(upserts, MAX_BLOBS_IN_FLIGHT, (p) => git.createBlob(ref, texts.get(local[p])!));
    const tree = await git.createTree(ref, head.tree, [
      ...upserts.map((p, i) => ({ path: toRepoPath(link.path, p), sha: blobs[i] })),
      ...deletes.map((p) => ({ path: toRepoPath(link.path, p), sha: null })),
    ]);
    const commit = await git.createCommit(ref, message, tree, [head.commit]);
    try {
      await git.updateRef(ref, link.branch, commit);
    } catch (e) {
      if (e instanceof GitSyncError && e.code === "not_fast_forward") {
        throw new GitSyncError("not_fast_forward", "The branch moved on GitHub — pull first.", e.detail);
      }
      throw e;
    }

    const baseFiles: Shas = { ...link.baseFiles };
    for (const p of upserts) baseFiles[p] = local[p];
    for (const p of deletes) delete baseFiles[p];
    this.deps.links.set(projectId, { ...link, baseCommit: commit, baseFiles });
    return { commit };
  }

  /**
   * Links an existing project to `folder`, initializing the marker if needed (`branch`
   * null = empty repo, use the default branch). The link starts without a common base,
   * so the first pull brings in the remote files: applied right away without conflicts
   * (null), otherwise returned for the caller to resolve via `applyPull`. Pending undos
   * of the project are dropped so none can bring back the old link.
   */
  async linkProject(
    projectId: string,
    ref: RepoRef,
    branch: string | null,
    folder: string,
  ): Promise<PreparedPull | null> {
    this.assertUnlocked(projectId);
    const git = this.deps.provider();
    const name = branch ?? (await git.getRepo(ref)).defaultBranch;
    const head = await git.getHead(ref, name);
    if (head) {
      const paths = (await git.getTree(ref, head.tree)).filter((e) => e.type === "blob").map((e) => e.path);
      const { folders, nested } = findMarkerFolders([...new Set([...paths, markerPath(folder)])]);
      assertNotNested(folders, nested, folder);
    }
    await this.initialize(ref, head ? name : branch, folder);

    const previous = this.deps.links.get(projectId);
    this.deps.links.set(projectId, {
      provider: "github",
      owner: ref.owner,
      repo: ref.repo,
      branch: name,
      path: folder,
      marker: { format: SUPPORTED_FORMAT },
      baseCommit: "",
      baseFiles: {},
    });
    try {
      const prepared = await this.preparePull(projectId);
      this.dropUndos(projectId);
      if (prepared && prepared.conflicts.length === 0) {
        await this.applyPull(prepared, {});
        return null;
      }
      return prepared;
    } catch (e) {
      if (previous) this.deps.links.set(projectId, previous);
      else this.deps.links.removeProject(projectId);
      throw e;
    }
  }

  /** Drops the link and any pending undo that would bring it back. */
  unlink(projectId: string): void {
    this.deps.links.removeProject(projectId);
    this.dropUndos(projectId);
  }

  private dropUndos(projectId: string): void {
    for (const [token, undo] of this.undos) {
      if (undo.projectId === projectId) this.undos.delete(token);
    }
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
      folders: repoFolders(paths, entries),
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
   * The remote files a project tracks below `folder`: text only, and at most one contract.
   * The contract kept is, in order: the base one, the local one (if the remote has it at
   * the same path), none if local holds a different contract that survives the pull, else
   * the first by path.
   * Everything else lands in `skipped`. `texts` maps the sha of every selected file to its
   * text; shas in `knownText` are taken from there instead of being fetched.
   */
  private async selectRemote(
    ref: RepoRef,
    entries: TreeEntry[],
    folder: string,
    opts: { knownText?: Map<string, string>; base?: Shas; local?: Shas } = {},
  ) {
    const { tracked, skipped } = selectTracked(entries, folder, trackedType);
    const git = this.deps.provider();
    const texts = new Map<string, string>();
    for (const { sha } of tracked) {
      const known = opts.knownText?.get(sha);
      if (known !== undefined) texts.set(sha, known);
    }
    const toFetch = [...new Set(tracked.map((t) => t.sha))].filter((sha) => !texts.has(sha));
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
    const { base = {}, local = {} } = opts;
    // Past rules 1 and 2 no local contract is in the remote set, so an unchanged one
    // (local sha == base sha) is deleted by the pull and must not block a remote one.
    const survivesPull = (p: string) => !(Object.hasOwn(base, p) && base[p] === local[p]);
    const keep =
      contracts.find((p) => Object.hasOwn(base, p)) ??
      contracts.find((p) => Object.hasOwn(local, p)) ??
      (countContracts(Object.keys(local).filter(survivesPull)) > 0 ? undefined : contracts[0]);
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
