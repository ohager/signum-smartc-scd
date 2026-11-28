export interface RepoRef {
  owner: string;
  repo: string;
}

export interface BranchHead {
  commit: string;
  tree: string;
}

export interface TreeEntry {
  path: string;
  sha: string;
  type: "blob" | "tree" | "commit";
}

export interface GitProvider {
  getUser(): Promise<{ login: string }>;
  getRepo(ref: RepoRef): Promise<{ defaultBranch: string; canPush: boolean }>;
  listBranches(ref: RepoRef): Promise<string[]>; // [] for an empty repo
  getHead(ref: RepoRef, branch: string): Promise<BranchHead | null>; // null: branch missing / repo empty
  getTree(ref: RepoRef, tree: string): Promise<TreeEntry[]>; // recursive; throws "truncated"
  getBlob(ref: RepoRef, sha: string): Promise<Uint8Array>;
  createBlob(ref: RepoRef, text: string): Promise<string>;
  createTree(
    ref: RepoRef,
    baseTree: string,
    changes: { path: string; sha: string | null }[],
  ): Promise<string>;
  createCommit(ref: RepoRef, message: string, tree: string, parents: string[]): Promise<string>;
  updateRef(ref: RepoRef, branch: string, commit: string): Promise<void>; // throws "not_fast_forward"
  putFile(
    ref: RepoRef,
    args: { path: string; text: string; message: string; branch?: string; sha?: string },
  ): Promise<{ commit: string }>;
}
