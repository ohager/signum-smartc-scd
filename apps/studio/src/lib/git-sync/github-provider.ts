import { GitSyncError } from "./errors.ts";
import type { BranchHead, GitProvider, RepoRef, TreeEntry } from "./provider.ts";

const API = "https://api.github.com";

const encodePath = (path: string) => path.split("/").map(encodeURIComponent).join("/");

function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64.replace(/\s/g, ""));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  /** Statuses returned as-is (no error) instead of being mapped. */
  passStatuses?: number[];
  /** Error code for a 422 response. */
  on422?: "not_fast_forward";
}

export class GitHubProvider implements GitProvider {
  constructor(
    private readonly token: string,
    private readonly fetchFn: typeof fetch = (input, init) => fetch(input, init),
  ) {}

  private repoPath({ owner, repo }: RepoRef): string {
    return `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`;
  }

  private async request(urlOrPath: string, options: RequestOptions = {}): Promise<Response> {
    const url = urlOrPath.startsWith("https://") ? urlOrPath : `${API}${urlOrPath}`;
    if (!url.startsWith(`${API}/`)) {
      throw new GitSyncError("network", "Refusing to contact a host other than api.github.com");
    }
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    const init: RequestInit = { method: options.method ?? "GET", headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(options.body);
    }
    let response: Response;
    try {
      const send = this.fetchFn; // unbound: a browser fetch rejects a foreign receiver
      response = await send(url, init);
    } catch (e) {
      throw new GitSyncError("network", e instanceof Error ? e.message : "Network request failed");
    }
    if (response.ok || options.passStatuses?.includes(response.status)) return response;
    throw this.mapError(response, options);
  }

  private mapError(response: Response, options: RequestOptions): GitSyncError {
    const status = response.status;
    const detail = { status };
    if (status === 401) return new GitSyncError("auth", "GitHub rejected the token", detail);
    if ((status === 403 || status === 429) && response.headers.get("x-ratelimit-remaining") === "0") {
      const reset = Number(response.headers.get("x-ratelimit-reset"));
      return new GitSyncError("rate_limited", "GitHub rate limit reached", {
        status,
        ...(Number.isFinite(reset) && reset > 0 ? { resetAt: reset * 1000 } : {}),
      });
    }
    if (status === 403) return new GitSyncError("forbidden", "GitHub denied access", detail);
    if (status === 404) return new GitSyncError("not_found", "Not found on GitHub", detail);
    if (status === 422 && options.on422) {
      return new GitSyncError(options.on422, "The branch moved on GitHub", detail);
    }
    if (status === 409) return new GitSyncError("not_found", "The repository is empty", detail);
    return new GitSyncError("network", `GitHub request failed (${status})`, detail);
  }

  private async json<T>(urlOrPath: string, options?: RequestOptions): Promise<T> {
    const response = await this.request(urlOrPath, options);
    return (await response.json()) as T;
  }

  async getUser() {
    const user = await this.json<{ login: string }>("/user");
    return { login: user.login };
  }

  async getRepo(ref: RepoRef) {
    const repo = await this.json<{ default_branch: string; permissions?: { push?: boolean } }>(
      this.repoPath(ref),
    );
    return { defaultBranch: repo.default_branch, canPush: repo.permissions?.push === true };
  }

  async listBranches(ref: RepoRef): Promise<string[]> {
    const names: string[] = [];
    let next: string | null = `${this.repoPath(ref)}/branches?per_page=100`;
    while (next) {
      const response = await this.request(next, { passStatuses: [409] });
      if (response.status === 409) return [];
      const page = (await response.json()) as { name: string }[];
      names.push(...page.map((b) => b.name));
      const link: string = response.headers.get("link") ?? "";
      next = /<([^>]+)>;\s*rel="next"/.exec(link)?.[1] ?? null;
    }
    return names;
  }

  async getHead(ref: RepoRef, branch: string): Promise<BranchHead | null> {
    const response = await this.request(
      `${this.repoPath(ref)}/branches/${encodeURIComponent(branch)}`,
      { passStatuses: [404, 409] },
    );
    if (response.status === 404 || response.status === 409) return null;
    const body = (await response.json()) as { commit: { sha: string; commit: { tree: { sha: string } } } };
    return { commit: body.commit.sha, tree: body.commit.commit.tree.sha };
  }

  async getTree(ref: RepoRef, tree: string): Promise<TreeEntry[]> {
    const body = await this.json<{ tree: TreeEntry[]; truncated?: boolean }>(
      `${this.repoPath(ref)}/git/trees/${encodeURIComponent(tree)}?recursive=1`,
    );
    if (body.truncated) {
      throw new GitSyncError("truncated", "The repository tree is too large to read completely");
    }
    return body.tree.map(({ path, sha, type }) => ({ path, sha, type }));
  }

  async getBlob(ref: RepoRef, sha: string): Promise<Uint8Array> {
    const body = await this.json<{ content: string }>(
      `${this.repoPath(ref)}/git/blobs/${encodeURIComponent(sha)}`,
    );
    return fromBase64(body.content);
  }

  async createBlob(ref: RepoRef, text: string): Promise<string> {
    const body = await this.json<{ sha: string }>(`${this.repoPath(ref)}/git/blobs`, {
      method: "POST",
      body: { content: text, encoding: "utf-8" },
    });
    return body.sha;
  }

  async createTree(
    ref: RepoRef,
    baseTree: string,
    changes: { path: string; sha: string | null }[],
  ): Promise<string> {
    const body = await this.json<{ sha: string }>(`${this.repoPath(ref)}/git/trees`, {
      method: "POST",
      body: {
        base_tree: baseTree,
        tree: changes.map((c) => ({ path: c.path, mode: "100644", type: "blob", sha: c.sha })),
      },
    });
    return body.sha;
  }

  async createCommit(ref: RepoRef, message: string, tree: string, parents: string[]): Promise<string> {
    const body = await this.json<{ sha: string }>(`${this.repoPath(ref)}/git/commits`, {
      method: "POST",
      body: { message, tree, parents },
    });
    return body.sha;
  }

  async updateRef(ref: RepoRef, branch: string, commit: string): Promise<void> {
    await this.request(`${this.repoPath(ref)}/git/refs/heads/${encodePath(branch)}`, {
      method: "PATCH",
      body: { sha: commit, force: false },
      on422: "not_fast_forward",
    });
  }

  async putFile(
    ref: RepoRef,
    args: { path: string; text: string; message: string; branch?: string; sha?: string },
  ): Promise<{ commit: string }> {
    const body = await this.json<{ commit: { sha: string } }>(
      `${this.repoPath(ref)}/contents/${encodePath(args.path)}`,
      {
        method: "PUT",
        body: {
          message: args.message,
          content: toBase64(args.text),
          ...(args.branch !== undefined ? { branch: args.branch } : {}),
          ...(args.sha !== undefined ? { sha: args.sha } : {}),
        },
      },
    );
    return { commit: body.commit.sha };
  }
}
