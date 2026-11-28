import { describe, expect, it } from "bun:test";
import { GitSyncError, type GitSyncErrorCode } from "./errors.ts";
import { GitHubProvider } from "./github-provider.ts";

const ref = { owner: "o", repo: "r" };

interface Call {
  url: string;
  init: RequestInit;
}

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), init);
}

function setup(...queue: (Response | Error)[]) {
  const calls: Call[] = [];
  const fetchFn = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const next = queue.shift();
    if (!next) throw new Error("no queued response");
    if (next instanceof Error) throw next;
    return next;
  }) as unknown as typeof fetch;
  return { calls, provider: new GitHubProvider("tkn", fetchFn) };
}

const bodyOf = (call: Call) => JSON.parse(String(call.init.body));

async function codeOf(promise: Promise<unknown>): Promise<GitSyncError> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(GitSyncError);
    return e as GitSyncError;
  }
  throw new Error("expected rejection");
}

describe("GitHubProvider", () => {
  it("sends the token and API headers only to api.github.com", async () => {
    const { provider, calls } = setup(json({ login: "me" }));
    expect(await provider.getUser()).toEqual({ login: "me" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("https://api.github.com/user");
    const headers = calls[0]!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer tkn");
    expect(headers.Accept).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("getHead maps a branch and returns null for 404 and 409", async () => {
    const { provider } = setup(
      json({ commit: { sha: "c1", commit: { tree: { sha: "t1" } } } }),
      json({}, { status: 404 }),
      json({}, { status: 409 }),
    );
    expect(await provider.getHead(ref, "main")).toEqual({ commit: "c1", tree: "t1" });
    expect(await provider.getHead(ref, "gone")).toBeNull();
    expect(await provider.getHead(ref, "main")).toBeNull();
  });

  it("getTree throws truncated", async () => {
    const { provider } = setup(json({ tree: [], truncated: true }));
    expect((await codeOf(provider.getTree(ref, "t1"))).code).toBe("truncated");
  });

  it("getBlob decodes base64 with line breaks", async () => {
    const { provider } = setup(json({ content: "aGVs\nbG8K", encoding: "base64" }));
    const bytes = await provider.getBlob(ref, "s1");
    expect(new TextDecoder().decode(bytes)).toBe("hello\n");
  });

  it("createTree sends base_tree and null shas for deletions", async () => {
    const { provider, calls } = setup(json({ sha: "t9" }));
    const sha = await provider.createTree(ref, "t0", [
      { path: "a.ts", sha: "s" },
      { path: "b.ts", sha: null },
    ]);
    expect(sha).toBe("t9");
    expect(calls[0]!.init.method).toBe("POST");
    expect(bodyOf(calls[0]!)).toEqual({
      base_tree: "t0",
      tree: [
        { path: "a.ts", mode: "100644", type: "blob", sha: "s" },
        { path: "b.ts", mode: "100644", type: "blob", sha: null },
      ],
    });
  });

  it("updateRef never forces and maps 422 to not_fast_forward", async () => {
    const { provider, calls } = setup(json({}), json({}, { status: 422 }));
    await provider.updateRef(ref, "main", "c2");
    expect(calls[0]!.init.method).toBe("PATCH");
    expect(bodyOf(calls[0]!)).toEqual({ sha: "c2", force: false });
    expect((await codeOf(provider.updateRef(ref, "main", "c3"))).code).toBe("not_fast_forward");
  });

  it("putFile base64-encodes UTF-8 and returns the commit", async () => {
    const { provider, calls } = setup(json({ commit: { sha: "c9" } }));
    const result = await provider.putFile(ref, { path: ".smartc-studio", text: "€\n", message: "m" });
    expect(result).toEqual({ commit: "c9" });
    expect(calls[0]!.init.method).toBe("PUT");
    const body = bodyOf(calls[0]!);
    expect(body.content).toBe(Buffer.from("€\n", "utf8").toString("base64"));
    expect(body.message).toBe("m");
    expect("branch" in body).toBe(false);
    expect("sha" in body).toBe(false);
  });

  it("putFile maps 409 and 422 to stale", async () => {
    const { provider } = setup(json({}, { status: 409 }), json({}, { status: 422 }));
    const args = { path: "a", text: "x", message: "m", sha: "old" };
    expect((await codeOf(provider.putFile(ref, args))).code).toBe("stale");
    expect((await codeOf(provider.putFile(ref, args))).code).toBe("stale");
  });

  it("maps 401, rate limit, plain 403 and network failure", async () => {
    const { provider } = setup(
      json({}, { status: 401 }),
      json({}, { status: 403, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1700000000" } }),
      json({}, { status: 403, headers: { "x-ratelimit-remaining": "42" } }),
      new TypeError("offline"),
    );
    expect((await codeOf(provider.getUser())).code).toBe("auth");
    const limited = await codeOf(provider.getUser());
    expect(limited.code).toBe("rate_limited");
    expect(limited.detail?.resetAt).toBe(1700000000000);
    expect((await codeOf(provider.getUser())).code).toBe("forbidden");
    expect((await codeOf(provider.getUser())).code as GitSyncErrorCode).toBe("network");
  });

  it("maps secondary rate limits (retry-after or message) to rate_limited", async () => {
    const { provider } = setup(
      json({ message: "x" }, { status: 403, headers: { "retry-after": "60" } }),
      json({ message: "You have exceeded a secondary rate limit." }, { status: 403 }),
      json({}, { status: 429 }),
    );
    const before = Date.now();
    const retry = await codeOf(provider.getUser());
    expect(retry.code).toBe("rate_limited");
    expect(retry.detail?.resetAt).toBeGreaterThanOrEqual(before + 60_000);
    expect(retry.detail?.resetAt).toBeLessThanOrEqual(Date.now() + 60_000);
    const secondary = await codeOf(provider.getUser());
    expect(secondary.code).toBe("rate_limited");
    expect(secondary.detail?.resetAt).toBeUndefined();
    expect((await codeOf(provider.getUser())).code).toBe("rate_limited");
  });

  it("keeps the status of other error answers", async () => {
    const { provider } = setup(json({}, { status: 500 }), new TypeError("offline"));
    const server = await codeOf(provider.getUser());
    expect(server.code).toBe("network");
    expect(server.detail?.status).toBe(500);
    const offline = await codeOf(provider.getUser());
    expect(offline.code).toBe("network");
    expect(offline.detail?.status).toBeUndefined();
  });

  it("encodes branch and path segments", async () => {
    const { provider, calls } = setup(
      json({ commit: { sha: "c", commit: { tree: { sha: "t" } } } }),
      json({}),
      json({ commit: { sha: "c" } }),
    );
    await provider.getHead(ref, "feat/x y");
    await provider.updateRef(ref, "feat/x y", "c");
    await provider.putFile(ref, { path: "a b/.smartc-studio", text: "x", message: "m" });
    expect(calls[0]!.url).toBe("https://api.github.com/repos/o/r/branches/feat/x%20y");
    expect(calls[1]!.url).toBe("https://api.github.com/repos/o/r/git/refs/heads/feat/x%20y");
    expect(calls[2]!.url).toBe("https://api.github.com/repos/o/r/contents/a%20b/.smartc-studio");
  });

  it("follows Link rel=next for branches and returns [] for an empty repo", async () => {
    const next = "https://api.github.com/repositories/1/branches?per_page=100&page=2";
    const { provider, calls } = setup(
      json([{ name: "a" }], { headers: { link: `<${next}>; rel="next", <x>; rel="last"` } }),
      json([{ name: "b" }]),
      json({}, { status: 409 }),
    );
    expect(await provider.listBranches(ref)).toEqual(["a", "b"]);
    expect(calls[1]!.url).toBe(next);
    expect(await provider.listBranches(ref)).toEqual([]);
  });

  it("calls the default fetch unbound", async () => {
    const original = globalThis.fetch;
    let receiver: unknown = "unset";
    globalThis.fetch = function (this: unknown) {
      receiver = this;
      return Promise.resolve(json({ login: "me" }));
    } as unknown as typeof fetch;
    try {
      expect(await new GitHubProvider("tkn").getUser()).toEqual({ login: "me" });
    } finally {
      globalThis.fetch = original;
    }
    expect(receiver === undefined || receiver === globalThis).toBe(true);
  });
});
