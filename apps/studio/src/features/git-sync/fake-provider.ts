import { GitSyncError } from "@/lib/git-sync/errors";
import type { BranchHead, GitProvider, RepoRef, TreeEntry } from "@/lib/git-sync/provider";

type Files = Record<string, string | Uint8Array>;
interface Commit {
  tree: string;
  parents: string[];
  message: string;
}
interface Repo {
  defaultBranch: string;
  canPush: boolean;
  blobs: Map<string, Uint8Array>;
  trees: Map<string, Record<string, string>>;
  commits: Map<string, Commit>;
  refs: Map<string, string>;
}

const key = (ref: RepoRef) => `${ref.owner}/${ref.repo}`;

async function sha1(data: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-1", data as BufferSource);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
  const out = new Uint8Array(a.byteLength + b.byteLength);
  out.set(a, 0);
  out.set(b, a.byteLength);
  return out;
}

/** Git blob id of raw bytes (same value as `gitBlobSha` for UTF-8 text). */
export function gitBlobShaOfBytes(body: Uint8Array): Promise<string> {
  return sha1(concat(new TextEncoder().encode(`blob ${body.byteLength}\0`), body));
}

const toBytes = (v: string | Uint8Array) => (typeof v === "string" ? new TextEncoder().encode(v) : v);

/**
 * In-memory GitHub for tests. Mirrors the real provider: Git Data writes on an
 * empty repo fail like GitHub's 409 (`not_found`), `getHead` is null for a missing
 * branch, `updateRef` only fast-forwards, `putFile` works on empty repos.
 */
export class FakeGitHub implements GitProvider {
  private readonly repos = new Map<string, Repo>();
  private counter = 0;

  /** Registers an empty repo (no commits, no branches). */
  createEmptyRepo(ref: RepoRef, defaultBranch = "main", canPush = true): void {
    this.repos.set(key(ref), {
      defaultBranch,
      canPush,
      blobs: new Map(),
      trees: new Map(),
      commits: new Map(),
      refs: new Map(),
    });
  }

  /** Adds a commit on `branch` (created if missing) that sets the given files; creates the repo if needed. */
  async seed(ref: RepoRef, branch: string, files: Files, message = "seed"): Promise<string> {
    if (!this.repos.has(key(ref))) this.createEmptyRepo(ref, branch);
    const repo = this.repos.get(key(ref))!;
    const head = repo.refs.get(branch);
    const base = head ? repo.trees.get(repo.commits.get(head)!.tree)! : {};
    const next = { ...base };
    for (const [path, value] of Object.entries(files)) {
      next[path] = await this.storeBlob(repo, toBytes(value));
    }
    const tree = await this.storeTree(repo, next);
    const commit = await this.storeCommit(repo, message, tree, head ? [head] : []);
    repo.refs.set(branch, commit);
    return commit;
  }

  setCanPush(ref: RepoRef, canPush: boolean): void {
    this.repo(ref).canPush = canPush;
  }

  /** Text of every file on the branch. */
  files(ref: RepoRef, branch: string): Record<string, string> {
    const repo = this.repo(ref);
    const head = repo.refs.get(branch);
    if (!head) return {};
    const tree = repo.trees.get(repo.commits.get(head)!.tree)!;
    return Object.fromEntries(
      Object.entries(tree).map(([path, sha]) => [path, new TextDecoder().decode(repo.blobs.get(sha)!)]),
    );
  }

  /** Commit shas on the branch, newest first (first-parent chain). */
  commitsOn(ref: RepoRef, branch: string): string[] {
    const repo = this.repo(ref);
    const out: string[] = [];
    for (let c = repo.refs.get(branch); c; c = repo.commits.get(c)?.parents[0]) out.push(c);
    return out;
  }

  commitMessage(sha: string): string {
    for (const repo of this.repos.values()) {
      const c = repo.commits.get(sha);
      if (c) return c.message;
    }
    throw new Error(`Unknown commit ${sha}`);
  }

  async getUser() {
    return { login: "tester" };
  }

  async getRepo(ref: RepoRef) {
    const { defaultBranch, canPush } = this.repo(ref);
    return { defaultBranch, canPush };
  }

  async listBranches(ref: RepoRef) {
    return [...this.repo(ref).refs.keys()];
  }

  async getHead(ref: RepoRef, branch: string): Promise<BranchHead | null> {
    const repo = this.repo(ref);
    const commit = repo.refs.get(branch);
    return commit ? { commit, tree: repo.commits.get(commit)!.tree } : null;
  }

  async getTree(ref: RepoRef, tree: string): Promise<TreeEntry[]> {
    const flat = this.repo(ref).trees.get(tree);
    if (!flat) throw new GitSyncError("not_found", `Unknown tree ${tree}`);
    return Object.entries(flat).map(([path, sha]) => ({ path, sha, type: "blob" as const }));
  }

  async getBlob(ref: RepoRef, sha: string) {
    const blob = this.repo(ref).blobs.get(sha);
    if (!blob) throw new GitSyncError("not_found", `Unknown blob ${sha}`);
    return blob;
  }

  async createBlob(ref: RepoRef, text: string) {
    return this.storeBlob(this.writable(ref), new TextEncoder().encode(text));
  }

  async createTree(ref: RepoRef, baseTree: string, changes: { path: string; sha: string | null }[]) {
    const repo = this.writable(ref);
    const base = repo.trees.get(baseTree);
    if (!base) throw new GitSyncError("not_found", `Unknown tree ${baseTree}`);
    const next = { ...base };
    for (const { path, sha } of changes) {
      if (sha === null) delete next[path];
      else next[path] = sha;
    }
    return this.storeTree(repo, next);
  }

  async createCommit(ref: RepoRef, message: string, tree: string, parents: string[]) {
    return this.storeCommit(this.writable(ref), message, tree, parents);
  }

  async updateRef(ref: RepoRef, branch: string, commit: string) {
    const repo = this.writable(ref);
    const head = repo.refs.get(branch);
    if (!head) throw new GitSyncError("not_found", `Unknown branch ${branch}`);
    if (!repo.commits.get(commit)?.parents.includes(head)) {
      throw new GitSyncError("not_fast_forward", "The branch moved on GitHub — pull first.");
    }
    repo.refs.set(branch, commit);
  }

  async putFile(
    ref: RepoRef,
    args: { path: string; text: string; message: string; branch?: string; sha?: string },
  ) {
    const repo = this.repo(ref);
    const branch = args.branch ?? repo.defaultBranch;
    const head = repo.refs.get(branch);
    if (!head && repo.refs.size > 0) throw new GitSyncError("not_found", `Unknown branch ${branch}`);
    const base = head ? repo.trees.get(repo.commits.get(head)!.tree)! : {};
    const existing = base[args.path];
    if (existing !== undefined && existing !== args.sha) {
      throw new GitSyncError("stale", `${args.path} changed; its sha does not match`, { status: 409 });
    }
    const blob = await this.storeBlob(repo, new TextEncoder().encode(args.text));
    const tree = await this.storeTree(repo, { ...base, [args.path]: blob });
    const commit = await this.storeCommit(repo, args.message, tree, head ? [head] : []);
    repo.refs.set(branch, commit);
    return { commit };
  }

  private repo(ref: RepoRef): Repo {
    const repo = this.repos.get(key(ref));
    if (!repo) throw new GitSyncError("not_found", `Repository ${key(ref)} not found`, { status: 404 });
    return repo;
  }

  /** Git Data writes: an empty repo answers 409, which the real provider maps to not_found. */
  private writable(ref: RepoRef): Repo {
    const repo = this.repo(ref);
    if (repo.refs.size === 0) {
      throw new GitSyncError("not_found", "Git Repository is empty.", { status: 409 });
    }
    return repo;
  }

  private async storeBlob(repo: Repo, bytes: Uint8Array) {
    const sha = await gitBlobShaOfBytes(bytes);
    repo.blobs.set(sha, bytes);
    return sha;
  }

  private async storeTree(repo: Repo, flat: Record<string, string>) {
    const sorted = Object.fromEntries(Object.entries(flat).sort(([a], [b]) => (a < b ? -1 : 1)));
    const sha = await sha1(new TextEncoder().encode(`tree ${JSON.stringify(sorted)}`));
    repo.trees.set(sha, sorted);
    return sha;
  }

  private async storeCommit(repo: Repo, message: string, tree: string, parents: string[]) {
    const body = `commit ${tree} ${parents.join(",")} ${message} #${this.counter++}`;
    const sha = await sha1(new TextEncoder().encode(body));
    repo.commits.set(sha, { tree, parents, message });
    return sha;
  }
}
