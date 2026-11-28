# GitHub Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A Studio project can be imported from, initialized in, linked to, pulled from and pushed to a GitHub repo folder that carries a `.smartc-studio` marker.

**Architecture:** Pure, unit-tested building blocks in `lib/git-sync/` (marker, blob SHA, tracked-file rules, pull/push planning, link and token stores, the GitHub REST provider). A `GitSync` service in `features/git-sync/` orchestrates them over the Studio `FileSystem`, reusing the assistant's checkpoints for "Undo pull". React dialogs and a status badge sit on top. Git history lives only on GitHub.

**Tech Stack:** React 19, jotai, Radix/shadcn UI (`components/ui`), `bun:test`, Studio `FileSystem`, GitHub REST API (`api.github.com`, `X-GitHub-Api-Version: 2022-11-28`), Web Crypto (SHA-1).

**Spec:** `docs/superpowers/specs/2026-11-27-github-sync-design.md`

## Global Constraints

- Network: requests go **only** to `https://api.github.com`; headers `Authorization: Bearer <token>`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`.
- Marker file name `.smartc-studio`; content JSON `{ "format": 1 }`; `SUPPORTED_FORMAT = 1`; serialized with 2-space indent and a trailing newline; unknown keys preserved.
- Tracked files: below the marker folder, name accepted by `acceptedFileType` (`features/project/filetype-icons.tsx`) or ending in `.md` (type `FileTypes.Doc`), and UTF-8 text per `decodeTextOrNull` (`lib/file-system/transfer.ts`). The marker itself is never a workspace file.
- File content to text: `typeof content === "string" ? content : String(content ?? "")` — the same rule `FileTransfer.collectFolderEntries` uses.
- Push builds on `base_tree` and moves the ref with `force: false`; never a forced update.
- **Initialization always uses the Contents API** (`PUT /repos/{o}/{r}/contents/{path}`) with commit message `Initialize SmartC Studio project`, and commits only the marker. Reason: the Git Data API answers `409 Git Repository is empty` on empty repos. This also covers *linking* an existing project to a folder without a marker: initialize first, then the normal push (deviation from the spec's "marker in the first push" — one code path, same visible result as a plain initialization).
- Fixed copy (en): "The branch moved on GitHub — pull first." / "This repo needs a newer Studio." / commit message `Initialize SmartC Studio project`.
- Storage keys (`localStorage`): `smartc-studio:repo-links` (JSON `Record<projectId, RepoLink>`), `smartc-studio:github-token`.
- `lib/` stays DOM/React-free and never imports from `features/`. The service lives in `features/git-sync/` because it uses `features/assistant/rounds/checkpoints.ts`.
- No assistant tool may reach sync or the token: nothing in `features/assistant/tools/` imports `git-sync`.
- Pull and push refuse while the project is locked by an assistant round (`lockedProjectsAtom` in `features/assistant/state.ts`); after a pull or an undo, call `markTookOver(projectId)` on the assistant runtime when one exists (`AssistantContext`, `features/assistant/bridge/use-assistant.ts`).
- Call `flushPendingSaves()` (`lib/pending-saves.ts`) before reading local contents for status, pull or push.
- UI text via `t("project.git.…")` in `src/i18n/locales/en/project.json`, then `bun run i18n:types`; other locales in the last task.
- Unit tests use `bun:test`, sit next to the module; a real `FileSystem` in tests is `new FileSystem(new MemoryStorage(), new MemoryContent())` from `features/assistant/tools/test-fs.ts`.
- Run tests: `cd apps/studio && bun test src/lib/git-sync src/features/git-sync`.
- Every `git add` names explicit paths. Commit style `feat(git-sync): …`, ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Undo pull after a pull** — files go back, but if the link's `baseCommit`/`baseFiles` stayed at the new remote state, the next push would silently revert the remote changes. Undo must restore the previous link too (Task 6 test `undo restores the previous link`).
2. **Unsaved editor text at push time** — editors save debounced; a push right after typing would miss the last edit. Push flushes first (Task 7 test `push flushes pending saves before reading`).
3. **A remote file with a tracked extension but binary content** (e.g. a `.ts` with NUL bytes) — skipped and reported on import, and since it is not in `baseFiles` and not local, a push must not delete it (Task 7 test `push never deletes skipped remote files`).
4. **Token revoked or wrong scope mid-session** — 401/403 must surface as a clear `auth`/`forbidden` error and leave the link untouched; a failed `updateRef` after blobs/commit were created leaves `baseCommit` unchanged (Task 4 error mapping; Task 7 test `rejected ref update leaves the link unchanged`).
5. **Linked project deleted in Studio** — its link must be dropped, or a new project with a recycled view would show stale status; renaming keeps the link because ids are stable (Task 3 test `removeProject drops the link`, wired in Task 8).

---

### Task 1: Marker, blob SHA and tracked-file rules

**Files:**
- Create: `apps/studio/src/lib/git-sync/marker.ts`, `marker.test.ts`
- Create: `apps/studio/src/lib/git-sync/blob-sha.ts`, `blob-sha.test.ts`
- Create: `apps/studio/src/lib/git-sync/tracked.ts`, `tracked.test.ts`

**Interfaces:**
- Produces:
  - `MARKER_FILE = ".smartc-studio"`, `SUPPORTED_FORMAT = 1`
  - `type Marker = { format: number; [key: string]: unknown }`
  - `parseMarker(text: string): { ok: true; marker: Marker } | { ok: false; error: string }`
  - `serializeMarker(marker: Marker): string`
  - `markerPath(folder: string): string` — `""` → `.smartc-studio`, `"a/b"` → `a/b/.smartc-studio`
  - `findMarkerFolders(paths: string[]): { folders: string[]; nested: string[] }` — `folders` sorted; `nested` = folders lying below another marker folder
  - `gitBlobSha(text: string): Promise<string>` (lowercase hex)
  - `type ResolveTracked = (name: string) => string | null`
  - `selectTracked(entries: { path: string; sha: string; type: string }[], folder: string, resolve: ResolveTracked): { tracked: { relPath: string; sha: string }[]; skipped: string[] }` — only `type === "blob"` below `folder`, `relPath` relative to it, marker excluded; rejected names go to `skipped` (relPaths)
  - `toRepoPath(folder: string, relPath: string): string`

`tracked.ts` takes the resolver as a parameter (lib must not import `features/`); the app's resolver is defined in Task 5.

- [ ] **Step 1: Write the failing tests**

```ts
// marker.test.ts
it("parses format and keeps unknown keys", () => {
  expect(parseMarker('{ "format": 1, "ignore": ["x"] }')).toEqual({ ok: true, marker: { format: 1, ignore: ["x"] } });
});
it("rejects non-JSON, non-objects and a missing or non-integer format", () => {
  for (const t of ["nope", "[]", "{}", '{"format":"1"}', '{"format":1.5}']) expect(parseMarker(t).ok).toBe(false);
});
it("serializes with 2 spaces and a trailing newline", () => {
  expect(serializeMarker({ format: 1 })).toBe('{\n  "format": 1\n}\n');
});
it("finds marker folders and flags nested ones", () => {
  expect(findMarkerFolders([".smartc-studio", "a/.smartc-studio", "b/c/.smartc-studio", "b/x.ts"]))
    .toEqual({ folders: ["", "a", "b/c"], nested: ["a", "b/c"] });
  expect(findMarkerFolders(["a/.smartc-studio", "b/.smartc-studio"])).toEqual({ folders: ["a", "b"], nested: [] });
});

// blob-sha.test.ts
it("matches git hash-object", async () => {
  expect(await gitBlobSha("hello\n")).toBe("ce013625030ba8dba906f756967f9e9ca394464a");
  expect(await gitBlobSha("")).toBe("e69de29bb2d1d6434b8b29ae775ad8c2e48c5391");
});
it("hashes UTF-8 bytes, not UTF-16 units", async () => {
  const text = "€ ✓\n";
  const bytes = Buffer.from(text, "utf8");
  const ref = createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${bytes.length}\0`), bytes])).digest("hex");
  expect(await gitBlobSha(text)).toBe(ref);
});

// tracked.test.ts — resolver: (n) => n.endsWith(".smart.c") || n.endsWith(".md") ? "x" : null
it("keeps tracked blobs below the folder, relative, without the marker", () => {
  const r = selectTracked([
    { path: "c/.smartc-studio", sha: "m", type: "blob" },
    { path: "c/a.smart.c", sha: "1", type: "blob" },
    { path: "c/docs/r.md", sha: "2", type: "blob" },
    { path: "c/pkg.json", sha: "3", type: "blob" },
    { path: "c/docs", sha: "t", type: "tree" },
    { path: "other/b.smart.c", sha: "4", type: "blob" },
  ], "c", resolve);
  expect(r).toEqual({ tracked: [{ relPath: "a.smart.c", sha: "1" }, { relPath: "docs/r.md", sha: "2" }], skipped: ["pkg.json"] });
});
it("treats folder '' as the repo root", () => {
  expect(selectTracked([{ path: "a.smart.c", sha: "1", type: "blob" }], "", resolve).tracked).toEqual([{ relPath: "a.smart.c", sha: "1" }]);
});
it("joins repo paths", () => {
  expect(toRepoPath("", "a/b.ts")).toBe("a/b.ts");
  expect(toRepoPath("c", "a/b.ts")).toBe("c/a/b.ts");
});
```

- [ ] **Step 2: Run, expect FAIL** — `cd apps/studio && bun test src/lib/git-sync` → modules not found.
- [ ] **Step 3: Implement the three modules.** `gitBlobSha`: `crypto.subtle.digest("SHA-1", header ++ TextEncoder bytes)`, header `blob ${byteLength}\0`.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(git-sync): marker, blob sha and tracked-file rules`.

---

### Task 2: Pull and push planning (pure)

**Files:**
- Create: `apps/studio/src/lib/git-sync/plan.ts`, `plan.test.ts`

**Interfaces:**
- Produces:
  - `type Shas = Record<string, string>` (relPath → blob SHA)
  - `type PullAction = { kind: "write"; relPath: string } | { kind: "delete"; relPath: string }`
  - `interface Conflict { relPath: string; local: string | null; remote: string | null }` (`null` = absent on that side)
  - `planPull(base: Shas, local: Shas, remote: Shas): { actions: PullAction[]; conflicts: Conflict[] }`
  - `resolvePull(plan, choices: Record<string, "mine" | "theirs">, remote: Shas): PullAction[]` — throws if a conflict has no choice
  - `localChanges(base: Shas, local: Shas): { upserts: string[]; deletes: string[] }`
  - `type SyncState = "in_sync" | "local" | "remote" | "diverged"`
  - `syncState(localChangeCount: number, remoteAhead: boolean): SyncState`

Rule per path over the union of keys (`b`, `l`, `r`; `undefined` = absent): `l === r` → nothing; `r === b` → keep local; `l === b` → take remote (`r` undefined → delete, else write); otherwise conflict. All outputs sorted by relPath.

- [ ] **Step 1: Write the failing tests**

```ts
it("takes remote-only changes", () => {
  expect(planPull({ a: "1", d: "1" }, { a: "1", d: "1" }, { a: "2", n: "9" })).toEqual({
    actions: [{ kind: "write", relPath: "a" }, { kind: "delete", relPath: "d" }, { kind: "write", relPath: "n" }],
    conflicts: [],
  });
});
it("keeps local-only changes and ignores identical changes", () => {
  expect(planPull({ a: "1", b: "1" }, { a: "2", b: "3" }, { a: "1", b: "3" })).toEqual({ actions: [], conflicts: [] });
});
it("flags edit/edit and edit/delete as conflicts", () => {
  expect(planPull({ a: "1", b: "1" }, { a: "2", b: "5" }, { a: "3" }).conflicts).toEqual([
    { relPath: "a", local: "2", remote: "3" },
    { relPath: "b", local: "5", remote: null },
  ]);
});
it("with an empty base, overlapping different files conflict and remote-only files are written", () => {
  expect(planPull({}, { a: "1", k: "7" }, { a: "2", n: "3" })).toEqual({
    actions: [{ kind: "write", relPath: "n" }],
    conflicts: [{ relPath: "a", local: "1", remote: "2" }],
  });
});
it("resolvePull turns theirs into actions and mine into nothing; a missing choice throws", () => {
  const plan = planPull({ a: "1", b: "1" }, { a: "2", b: "2" }, { a: "3" });
  expect(resolvePull(plan, { a: "theirs", b: "theirs" }, { a: "3" })).toEqual([
    { kind: "write", relPath: "a" }, { kind: "delete", relPath: "b" },
  ]);
  expect(resolvePull(plan, { a: "mine", b: "mine" }, { a: "3" })).toEqual([]);
  expect(() => resolvePull(plan, { a: "mine" }, { a: "3" })).toThrow();
});
it("localChanges lists upserts and deletes", () => {
  expect(localChanges({ a: "1", b: "1", c: "1" }, { a: "1", b: "2", n: "3" })).toEqual({ upserts: ["b", "n"], deletes: ["c"] });
});
it("syncState", () => {
  expect([syncState(0, false), syncState(2, false), syncState(0, true), syncState(1, true)])
    .toEqual(["in_sync", "local", "remote", "diverged"]);
});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `plan.ts`.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(git-sync): pull and push planning`.

---

### Task 3: Link and token stores

**Files:**
- Create: `apps/studio/src/lib/git-sync/repo-links.ts`, `repo-links.test.ts`
- Create: `apps/studio/src/lib/git-sync/token-store.ts`, `token-store.test.ts`

**Interfaces:**
- Consumes: `MetadataStorage` (`lib/file-system/content-store.ts`; `getItem`, `setItem`, optional `watch`), `Marker`, `Shas`.
- Produces:
  - ```ts
    interface RepoLink {
      provider: "github"; owner: string; repo: string; branch: string;
      path: string;          // marker folder, "" = repo root
      marker: Marker;        // parsed marker content
      baseCommit: string;
      baseFiles: Shas;
    }
    ```
  - `class RepoLinks extends EventTarget` — `constructor(storage: MetadataStorage)`; `get(projectId): RepoLink | null`; `set(projectId, link)`; `removeProject(projectId)`; `all(): Record<string, RepoLink>`; dispatches `"change"` on every write and on a write from another tab (via `storage.watch`). Unreadable JSON → treated as empty, never throws.
  - `class TokenStore` — `constructor(storage: MetadataStorage)`; `get(): string | null`; `set(token: string)`; `clear()`.
  - Keys: `REPO_LINKS_KEY = "smartc-studio:repo-links"`, `TOKEN_KEY = "smartc-studio:github-token"`.

`MetadataStorage` has no `removeItem`; `clear()` writes `""` and `get()` maps `""` to `null`.

- [ ] **Step 1: Write the failing tests** (with `MemoryStorage` from `features/assistant/tools/test-fs.ts`)

```ts
it("round-trips a link per project", () => { /* set(p1, link) → new RepoLinks(sameStorage).get(p1) toEqual link; get(p2) null */ });
it("removeProject drops the link", () => { /* set, removeProject → get null, all() {} */ });
it("emits change on set, remove and another tab's write", () => {
  /* listener count 3 after set, removeProject, storage.writeFromAnotherTab(REPO_LINKS_KEY, JSON.stringify({ p: link })); then get("p") equals link */
});
it("survives garbage in storage", () => { /* storage.setItem(REPO_LINKS_KEY, "{oops") → all() toEqual {} */ });
it("token set/get/clear", () => { /* get() null → set("t") → "t" → clear() → null */ });
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement both stores.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(git-sync): repo link and token stores`.

---

### Task 4: GitHub provider and errors

**Files:**
- Create: `apps/studio/src/lib/git-sync/errors.ts`
- Create: `apps/studio/src/lib/git-sync/provider.ts` (interface)
- Create: `apps/studio/src/lib/git-sync/github-provider.ts`, `github-provider.test.ts`

**Interfaces:**
- Produces:
  - ```ts
    type GitSyncErrorCode = "no_token" | "auth" | "forbidden" | "rate_limited" | "not_found" | "not_fast_forward"
      | "truncated" | "no_marker" | "nested_markers" | "format_unsupported" | "invalid_marker"
      | "locked" | "stale" | "nothing_to_push" | "network";
    class GitSyncError extends Error { constructor(code: GitSyncErrorCode, message: string, readonly detail?: { resetAt?: number; status?: number }); readonly code: GitSyncErrorCode }
    ```
  - ```ts
    interface RepoRef { owner: string; repo: string }
    interface BranchHead { commit: string; tree: string }
    interface TreeEntry { path: string; sha: string; type: "blob" | "tree" | "commit" }
    interface GitProvider {
      getUser(): Promise<{ login: string }>;
      getRepo(ref: RepoRef): Promise<{ defaultBranch: string; canPush: boolean }>;
      listBranches(ref: RepoRef): Promise<string[]>;                 // [] for an empty repo
      getHead(ref: RepoRef, branch: string): Promise<BranchHead | null>; // null: branch missing / repo empty
      getTree(ref: RepoRef, tree: string): Promise<TreeEntry[]>;      // recursive; throws "truncated"
      getBlob(ref: RepoRef, sha: string): Promise<Uint8Array>;
      createBlob(ref: RepoRef, text: string): Promise<string>;
      createTree(ref: RepoRef, baseTree: string, changes: { path: string; sha: string | null }[]): Promise<string>;
      createCommit(ref: RepoRef, message: string, tree: string, parents: string[]): Promise<string>;
      updateRef(ref: RepoRef, branch: string, commit: string): Promise<void>; // throws "not_fast_forward"
      putFile(ref: RepoRef, args: { path: string; text: string; message: string; branch?: string; sha?: string }): Promise<{ commit: string }>;
    }
    ```
  - `class GitHubProvider implements GitProvider { constructor(token: string, fetchFn: typeof fetch = fetch) }`

Endpoints: `GET /user`; `GET /repos/{o}/{r}` (`default_branch`, `permissions.push`); `GET /repos/{o}/{r}/branches?per_page=100` (follow `Link: rel="next"`; `409` → `[]`); `GET /repos/{o}/{r}/branches/{b}` (`commit.sha`, `commit.commit.tree.sha`; `404`/`409` → `null`); `GET …/git/trees/{sha}?recursive=1`; `GET …/git/blobs/{sha}` (base64, strip newlines); `POST …/git/blobs {content, encoding: "utf-8"}`; `POST …/git/trees {base_tree, tree: [{path, mode: "100644", type: "blob", sha}]}`; `POST …/git/commits {message, tree, parents}`; `PATCH …/git/refs/heads/{b} {sha, force: false}`; `PUT …/contents/{path} {message, content: base64(utf8), branch?, sha?}` → `commit.sha`. Path segments and branch names are URI-encoded per segment.

Error mapping: `401` → `auth`; `403`/`429` with `x-ratelimit-remaining: 0` → `rate_limited` (`resetAt` = `x-ratelimit-reset` × 1000); other `403` → `forbidden`; `404` → `not_found` (except where mapped to `null`/`[]` above); `422` on `updateRef` → `not_fast_forward`; `409` (empty repo) on any other endpoint → `not_found`; any other non-2xx → `network` with `detail.status`; `fetch` rejection → `network`.

- [ ] **Step 1: Write the failing tests** — a recording fake `fetchFn` returning queued `Response`s:

```ts
it("sends the token and API headers only to api.github.com", async () => {
  /* getUser() → one request to "https://api.github.com/user", Authorization "Bearer tkn",
     Accept "application/vnd.github+json", X-GitHub-Api-Version "2022-11-28" */
});
it("getHead maps a branch and returns null for 404 and 409", async () => { /* {commit:"c1", tree:"t1"}; then null; then null */ });
it("getTree throws truncated", async () => { /* body {tree:[], truncated:true} → GitSyncError code "truncated" */ });
it("getBlob decodes base64 with line breaks", async () => { /* content "aGVs\nbG8K" → bytes of "hello\n" */ });
it("createTree sends base_tree and null shas for deletions", async () => {
  /* body equals { base_tree: "t0", tree: [{path:"a.ts",mode:"100644",type:"blob",sha:"s"},{path:"b.ts",mode:"100644",type:"blob",sha:null}] } */
});
it("updateRef never forces and maps 422 to not_fast_forward", async () => { /* body {sha:"c2", force:false}; 422 → code "not_fast_forward" */ });
it("putFile base64-encodes UTF-8 and returns the commit", async () => { /* text "€\n" → content base64 of its UTF-8 bytes; returns {commit:"c9"} */ });
it("maps 401, rate limit, plain 403 and network failure", async () => { /* "auth"; "rate_limited" with resetAt 1700000000000; "forbidden"; "network" */ });
it("encodes branch and path segments", async () => { /* branch "feat/x y" → ".../branches/feat%2Fx%20y"; contents path "a b/.smartc-studio" → ".../contents/a%20b/.smartc-studio" */ });
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `errors.ts`, `provider.ts`, `github-provider.ts`.** Branch names go into `branches/{b}` encoded as one segment (`encodeURIComponent`); in `git/refs/heads/{b}` keep `/` (encode each segment).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(git-sync): GitHub REST provider`.

---

### Task 5: GitSync service — import and initialize

**Files:**
- Create: `apps/studio/src/features/git-sync/tracked-type.ts` (the app resolver)
- Create: `apps/studio/src/features/git-sync/fake-provider.ts` (in-memory GitHub for tests)
- Create: `apps/studio/src/features/git-sync/sync-service.ts`, `sync-service.import.test.ts`

**Interfaces:**
- Consumes: Tasks 1–4; `FileTransfer.importEntries` via `fs.transfer`; `CheckpointStore` (`features/assistant/rounds/checkpoints.ts`); `uniqueName` (`features/project/file-naming.ts`).
- Produces:
  - `trackedType(name: string): string | null` = `acceptedFileType(name) ?? (name.toLowerCase().endsWith(".md") ? FileTypes.Doc : null)`
  - `class FakeGitHub implements GitProvider` — repos keyed `owner/repo`, content-addressed blobs (real `gitBlobSha`), trees as flat `path → sha` maps (`createTree` applies changes onto `baseTree`), commits, refs; `updateRef` throws `not_fast_forward` unless the new commit's parent is the current head; empty repos reject Git Data writes like GitHub (`409` → treat as `GitSyncError("not_found")`); `putFile` works on empty repos and creates the default branch. Helpers: `seed(ref, branch, files: Record<string, string | Uint8Array>)`, `files(ref, branch): Record<string, string>`, `commitsOn(ref, branch): string[]`, `commitMessage(sha)`.
  - ```ts
    type SyncFs = WorkspaceFs & Pick<FileSystem, "transfer">;   // WorkspaceFs from features/assistant/tools/paths.ts
    interface GitSyncDeps {
      fs: SyncFs; links: RepoLinks; provider: () => GitProvider;  // throws GitSyncError("no_token")
      checkpoints: CheckpointStore; clock: { now(): number };
      flush(): Promise<void>; isLocked(projectId: string): boolean; markTookOver(projectId: string): void;
    }
    interface RepoProbe { branches: string[]; defaultBranch: string; canPush: boolean;
      markers: { folder: string; marker: Marker | null; error?: string }[]; // marker null + error: invalid
      nested: string[]; folderStats(folder: string): { tracked: number; skipped: number } }
    class GitSync {
      constructor(deps: GitSyncDeps);
      probe(ref: RepoRef, branch: string): Promise<RepoProbe>;
      importProject(ref: RepoRef, branch: string, folder: string): Promise<{ projectId: string; imported: number; skipped: string[] }>;
      initialize(ref: RepoRef, branch: string | null, folder: string): Promise<void>; // branch null = empty repo → default branch
    }
    ```

Behaviour: `probe` reads head + tree (empty repo → `branches: []`, no markers), fetches and parses every marker. `importProject` refuses `nested_markers` if `folder` is in `probe.nested` or has a marker below it, `no_marker` if `folder` has none, `invalid_marker`, `format_unsupported` if `format > SUPPORTED_FORMAT` (message "This repo needs a newer Studio."). It fetches tracked blobs with at most 8 requests in flight, drops non-UTF-8 ones into `skipped`, creates a root folder named `uniqueName(folder ? last segment of folder : repo, rootNames)`, imports via `fs.transfer.importEntries(projectId, entries, trackedType)`, and stores the link with `baseFiles` = SHAs of the imported files only. `initialize` writes the marker with `putFile` (message `Initialize SmartC Studio project`); if a marker exists but is invalid, it passes that file's `sha` to overwrite it.

- [ ] **Step 1: Write the failing tests**

```ts
it("imports tracked files under the marker folder and links the project", async () => {
  // seed: "contracts/.smartc-studio" {format:1}, "contracts/a.smart.c", "contracts/t/a.test.ts", "contracts/README.md", "contracts/package.json", "root.smart.c"
  // importProject(ref, "main", "contracts") → project "contracts" with a.smart.c, t/a.test.ts, README.md; skipped ["package.json"]
  // link: path "contracts", branch "main", baseCommit = head, baseFiles keys ["README.md","a.smart.c","t/a.test.ts"] with real blob shas
});
it("reports binary files with a tracked extension as skipped and leaves them out of baseFiles", async () => { /* "c/x.ts" = bytes with 0x00 */ });
it("refuses no marker, nested markers, invalid markers and newer formats", async () => {
  /* codes: "no_marker", "nested_markers", "invalid_marker", "format_unsupported" (message "This repo needs a newer Studio.") */
});
it("names the project after the repo for a root marker and makes the name unique", async () => {
  /* root folder "repo" already exists; root marker → project name toBe(uniqueName("repo", ["repo"])) */
});
it("probe lists markers, nested ones and folder stats", async () => {
  /* seed ".smartc-studio", "x/.smartc-studio", "a.smart.c", "p.json" → markers folders ["", "x"], nested ["x"],
     folderStats("") toEqual { tracked: 1, skipped: 1 } (marker files and the nested folder's files not counted for "") */
});
it("initialize commits only the marker with the fixed message, also on an empty repo", async () => {
  /* non-empty: files(ref,"main") gains only "c/.smartc-studio" = serializeMarker({format:1}); commitMessage(head) "Initialize SmartC Studio project"
     empty: initialize(ref, null, "") → default branch has exactly {".smartc-studio": …} */
});
it("initialize overwrites an invalid marker", async () => { /* marker "nope" → after initialize parses as {format:1} */ });
it("needs a token", async () => { /* provider: () => { throw new GitSyncError("no_token", "") } → probe rejects with code "no_token" */ });
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement `tracked-type.ts`, `fake-provider.ts`, and `GitSync.probe/importProject/initialize`.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(git-sync): import and initialize`.

---

### Task 6: GitSync service — status, pull and undo

**Files:**
- Modify: `apps/studio/src/features/git-sync/sync-service.ts`
- Create: `apps/studio/src/features/git-sync/sync-service.pull.test.ts`

**Interfaces:**
- Consumes: `planPull`, `resolvePull`, `syncState`, `restoreWithUndo` and `captureProject` (`checkpoints.ts`).
- Produces (methods on `GitSync`):
  - `localShas(projectId: string): Promise<Shas>` — flushes first; tracked-type files only, keyed by path relative to the project
  - `status(projectId: string, opts?: { remote?: boolean }): Promise<{ state: SyncState; localChanges: number; remoteAhead: boolean | null }>` — `remoteAhead` is `null` when `remote` is false or the check failed
  - ```ts
    interface PreparedPull {
      projectId: string; head: BranchHead; remote: Shas; local: Shas;
      actions: PullAction[]; conflicts: Conflict[];
      remoteText: Record<string, string>;   // for every write action and every conflict with a remote side
      skipped: string[];
    }
    preparePull(projectId: string): Promise<PreparedPull | null>;   // null = already up to date
    applyPull(prepared: PreparedPull, choices: Record<string, "mine" | "theirs">): Promise<{ undoToken: string; written: string[]; deleted: string[] }>;
    undoPull(undoToken: string): Promise<void>;
    ```

Behaviour: `preparePull` and `applyPull` throw `locked` while `isLocked(projectId)`. `preparePull` stops with `no_marker` / `format_unsupported` / `invalid_marker` if the marker at the link's path is gone or bad, applying nothing. `applyPull` recomputes `localShas` and throws `stale` if they differ from `prepared.local`. It builds the target file list (current project files with the resolved actions applied) and calls `restoreWithUndo({ fs, store: checkpoints, clock }, projectId, target)`, which takes the undo checkpoint. It then sets the link to `baseCommit = head.commit`, `baseFiles = prepared.remote`, `marker` = the current remote marker, and calls `markTookOver`. Undo tokens live in memory: `Map<token, { projectId; checkpointId; previousLink }>`. `undoPull` restores the checkpoint via `restoreWithUndo`, puts back `previousLink`, and calls `markTookOver`.

- [ ] **Step 1: Write the failing tests** (import a seeded repo first, then mutate remote/local)

```ts
it("is up to date when the head did not move", async () => { /* preparePull → null */ });
it("applies remote-only changes silently and moves the base", async () => {
  /* remote edits a.smart.c, adds n.ts, deletes README.md → applyPull(p, {}) → local matches; link.baseCommit == new head; status → in_sync */
});
it("keeps local-only changes", async () => { /* local edit b.ts, remote edit a.smart.c → after pull b.ts still local edit; status.localChanges 1 */ });
it("requires a choice per conflict and honours mine/theirs", async () => {
  /* both edit a.smart.c → conflicts [{relPath:"a.smart.c",...}]; remoteText["a.smart.c"] = remote text;
     applyPull(p, {}) rejects; {a:"theirs"} → remote text; (fresh setup) {a:"mine"} → local text and status.localChanges 1 */
});
it("refuses while the project is locked", async () => { /* isLocked → true → code "locked" */ });
it("refuses a stale prepared pull", async () => { /* prepare, then edit a local file, apply → code "stale", nothing written */ });
it("stops when the marker was removed remotely", async () => { /* code "no_marker", local files unchanged */ });
it("undo restores the previous files and the previous link", async () => {
  /* link before = L0; pull; undoPull(token) → files as before, links.get(p) toEqual L0; status (remote:true) → "remote" */
});
it("marks the assistant as taken over after pull and undo", async () => { /* markTookOver called twice with projectId */ });
it("status counts local changes and sees the remote ahead", async () => { /* edit 2 local, push remote commit → {state:"diverged", localChanges:2, remoteAhead:true} */ });
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(git-sync): status, pull and undo pull`.

---

### Task 7: GitSync service — push, link and unlink

**Files:**
- Modify: `apps/studio/src/features/git-sync/sync-service.ts`
- Create: `apps/studio/src/features/git-sync/sync-service.push.test.ts`

**Interfaces:**
- Consumes: `localChanges`, provider Git Data calls.
- Produces (methods on `GitSync`):
  - `pendingChanges(projectId: string): Promise<{ upserts: string[]; deletes: string[] }>` — for the commit dialog
  - `push(projectId: string, message: string): Promise<{ commit: string }>`
  - `linkProject(projectId: string, ref: RepoRef, branch: string | null, folder: string): Promise<PreparedPull | null>` — initializes first if the folder has no marker (empty repo: `branch` null → default branch). It then stores a link with `baseFiles = {}` and **`baseCommit = ""`** (no common base yet, so `preparePull` never short-circuits and `push` refuses with `not_fast_forward` until the first pull is applied). Then it runs `preparePull(projectId)`: without conflicts it applies the plan right away (`applyPull(prepared, {})`) and returns `null`; with conflicts it returns the `PreparedPull` for the UI to resolve via `applyPull`. So the overlap with existing remote files always goes through the normal conflict path and a push can never overwrite remote files the link has not seen
  - `unlink(projectId: string): void`

Behaviour of `push`: throws `locked` while locked. It flushes, computes `localChanges(link.baseFiles, localShas)`, and throws `nothing_to_push` if both lists are empty. If `getHead` ≠ `link.baseCommit` it throws `not_fast_forward` with the message "The branch moved on GitHub — pull first.". Otherwise it creates a blob per upsert, then `createTree(head.tree, upserts with blob shas + deletes with null, paths via toRepoPath(link.path, …))`, `createCommit(message, tree, [head.commit])` and `updateRef`. Only after `updateRef` succeeds does it update the link (`baseCommit` = new commit; `baseFiles` with upserts set and deletes removed). Untracked and skipped remote files are never named in `changes`.

- [ ] **Step 1: Write the failing tests**

```ts
it("pushes local edits, additions and deletions in one commit on top of the base", async () => {
  /* edit a.smart.c, add sub/n.ts, delete README.md → push(p,"msg") → files(remote) reflect it; commitMessage == "msg";
     parent == old baseCommit; status → in_sync */
});
it("push never touches untracked or skipped remote files", async () => {
  /* seeded package.json, .github/ci.yml, binary c/x.ts survive byte-for-byte after a push that changes a.smart.c */
});
it("push never deletes skipped remote files", async () => { /* same binary x.ts; push after deleting a different file; x.ts still there */ });
it("refuses when the branch moved and says pull first", async () => {
  /* remote commit after import → code "not_fast_forward", message "The branch moved on GitHub — pull first.", link unchanged */
});
it("rejected ref update leaves the link unchanged", async () => {
  /* fake: make updateRef throw not_fast_forward once (someone pushed between getHead and updateRef) → link toEqual before */
});
it("push flushes pending saves before reading", async () => { /* flush spy called before the first loadFile (order recorded) */ });
it("refuses with nothing to push and while locked", async () => { /* "nothing_to_push"; "locked" */ });
it("links a project to an empty repo: marker commit first, then a push uploads all files", async () => {
  /* local project with 2 files; linkProject(p, ref, null, "") → null (auto-applied, link.baseCommit = marker commit); push → remote has marker + 2 files;
     commitsOn(main) messages ["Initialize SmartC Studio project", <push message>] */
});
it("links to a folder with existing files via conflicts", async () => {
  /* remote has marker and a.smart.c differing from local → linkProject returns conflicts [a.smart.c]; push before applyPull → code "not_fast_forward" */
});
it("unlink removes the link", async () => {});
```

- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(git-sync): push and link`.

---

### Task 8: Wiring, token dialog and import from GitHub

**Files:**
- Create: `apps/studio/src/features/git-sync/git-sync-context.tsx` (singleton service + hooks)
- Create: `apps/studio/src/features/git-sync/github-token-dialog.tsx`
- Create: `apps/studio/src/features/git-sync/import-dialog.tsx`
- Create: `apps/studio/src/features/git-sync/parse-repo.ts`, `parse-repo.test.ts`
- Modify: `apps/studio/src/features/home/hero.tsx` (new prop `onImportGitHubClick`), `apps/studio/src/pages/home/home-page.tsx`
- Modify: the app shell that mounts providers (where `AssistantProvider` is mounted) to mount `GitSyncProvider`
- Modify: `apps/studio/src/i18n/locales/en/project.json` (`git.*`), then `bun run i18n:types`

**Interfaces:**
- Consumes: `GitSync`, `RepoLinks`, `TokenStore`, `GitHubProvider`, `IdbCheckpointStore`, `flushPendingSaves`, `lockedProjectsAtom`/`jotaiStore`, `AssistantContext`.
- Produces:
  - `parseRepo(input: string): RepoRef | null` — accepts `owner/repo`, `https://github.com/owner/repo`, with optional `.git` / trailing slash / `/tree/...`
  - `GitSyncProvider` and `useGitSync(): { sync: GitSync; links: RepoLinks; tokens: TokenStore; requireToken(): Promise<boolean> }` — `requireToken` opens the token dialog when no token is stored, resolves `true` once one is saved
  - `useRepoLink(projectId: string): RepoLink | null` (re-renders on `links` `"change"`)
  - `gitErrorMessage(e: unknown): string` — maps every `GitSyncErrorCode` to `t("project.git.errors.<code>")`, `rate_limited` including the reset time
  - `<ImportFromGitHubDialog open onOpenChange />`

Wiring: one `GitSync` per app, `provider: () => new GitHubProvider(tokens.get() ?? throw no_token)`. `isLocked` reads `lockedProjectsAtom`; `markTookOver` calls `runtime?.rounds.markTookOver` through a ref fed from `AssistantContext`. On the FileSystem `folder:deleted` event, `links.removeProject(id)`.

Token dialog: a password-type input. The copy says the token is stored in this browser and sent only to GitHub, links to `https://github.com/settings/personal-access-tokens/new`, and names the scope "Contents: read and write". On save it validates with `getUser()` and shows the login, and it offers "Forget token" (`tokens.clear()`).

Import dialog flow: repo input → branch select (default preselected) → `probe`. Then one of: list of marker folders to pick from; nested/invalid markers shown with reason; or no marker, which offers **Initialize**. Initialize shows a folder picker over the repo's folders with `folderStats` (tracked/skipped counts), confirms that it creates a commit on GitHub, needs `canPush` (otherwise explains), then imports. Success toast reuses `common.import.done` / `doneWithSkipped` and lists skipped names in the description. Navigate to the new project.

- [ ] **Step 1: Write the failing test for `parseRepo`**

```ts
it("parses owner/repo forms", () => {
  for (const s of ["veridibloc/smart-contracts", "https://github.com/veridibloc/smart-contracts", "https://github.com/veridibloc/smart-contracts.git", "github.com/veridibloc/smart-contracts/tree/main/x"])
    expect(parseRepo(s)).toEqual({ owner: "veridibloc", repo: "smart-contracts" });
  for (const s of ["", "foo", "https://gitlab.com/a/b", "a/b/c d"]) expect(parseRepo(s)).toBeNull();
});
```

- [ ] **Step 2: Run, expect FAIL; implement `parse-repo.ts`; run, expect PASS.**
- [ ] **Step 3: Implement provider/context, token dialog, import dialog, Hero button and home wiring; add the en keys and run `bun run i18n:types`.**
- [ ] **Step 4: Verify** — `cd apps/studio && bun test src/lib/git-sync src/features/git-sync src/i18n` passes, and `bun run build` succeeds. Then in `bun dev`: with a test token, import a repo that has a marker, and initialize a scratch repo (empty and non-empty). Check in the browser network tab that no request goes anywhere but `api.github.com`.
- [ ] **Step 5: Commit** `feat(git-sync): GitHub token and import dialogs`.

---

### Task 9: Project actions — link, pull with conflicts, commit & push

**Files:**
- Create: `apps/studio/src/features/git-sync/link-dialog.tsx`, `commit-dialog.tsx`, `conflict-dialog.tsx`, `use-pull.ts`
- Create: `apps/studio/src/features/git-sync/commit-message.ts`, `commit-message.test.ts`
- Modify: `apps/studio/src/features/project/folder-node.tsx` (dropdown items for project roots only: `findProjectOfFolder(fs, folder.id) === folder.id`)
- Modify: `apps/studio/src/i18n/locales/en/project.json`, then `bun run i18n:types`

**Interfaces:**
- Consumes: `useGitSync`, `useRepoLink`, `gitErrorMessage`, `GitSync.linkProject/preparePull/applyPull/undoPull/pendingChanges/push/unlink`, `RoundDiffDialog`'s editor approach (`features/assistant/ui/round-diff-dialog.tsx`, `languageOf`) for the diff view.
- Produces:
  - `suggestCommitMessage(changes: { upserts: string[]; deletes: string[] }, baseFiles: Shas): string` — `Update a.smart.c` for one file; `Update 3 files` otherwise; first line ≤ 72 chars; body lists `A`/`M`/`D` per path (`A` = upsert not in base, `M` = upsert in base, `D` = delete)
  - `usePull(projectId)` → `{ pull(): Promise<void>; busy: boolean }` — runs `preparePull`; with conflicts opens `ConflictDialog` and waits for choices or cancel; applies; toast with **Undo pull** (calls `undoPull`); "up to date" toast on `null`

Menu: unlinked → "Link to GitHub…". Linked → "Pull", "Commit & Push…", "Unlink". Pull and push are disabled with the lock reason while `lockedProjectsAtom` has the project. Every action calls `requireToken()` first. `not_fast_forward` in the commit dialog offers a "Pull now" button.

Conflict dialog: lists the conflicting files. Per file there is a side-by-side diff of local and remote text (an absent side shows as an empty editor labelled "deleted"), and *Mine* / *Theirs* radio buttons. Apply is enabled once every file has a choice.

- [ ] **Step 1: Write the failing test for `suggestCommitMessage`**

```ts
it("suggests a message", () => {
  expect(suggestCommitMessage({ upserts: ["a.smart.c"], deletes: [] }, { "a.smart.c": "1" })).toBe("Update a.smart.c\n\nM a.smart.c");
  expect(suggestCommitMessage({ upserts: ["a.smart.c", "n.ts"], deletes: ["r.md"] }, { "a.smart.c": "1", "r.md": "2" }))
    .toBe("Update 3 files\n\nM a.smart.c\nA n.ts\nD r.md");
});
```

- [ ] **Step 2: Run, expect FAIL; implement; run, expect PASS.**
- [ ] **Step 3: Implement dialogs, `usePull` and the menu; add the en keys; run `bun run i18n:types`.**
- [ ] **Step 4: Verify** — tests and `bun run build` pass. Then in `bun dev` against a scratch repo: link an existing project to an empty repo and push. Edit on GitHub and pull. Make a conflicting edit on both sides and resolve once with *Mine* and once with *Theirs*. Undo a pull and confirm the status shows "remote ahead" again. Push while the branch moved and confirm the message "The branch moved on GitHub — pull first." appears. Start an assistant round and confirm pull and push are disabled.
- [ ] **Step 5: Commit** `feat(git-sync): link, pull, commit and push in the project menu`.

---

### Task 10: Sync status badge

**Files:**
- Create: `apps/studio/src/features/git-sync/use-repo-status.ts`, `sync-status-badge.tsx`
- Create: `apps/studio/src/features/git-sync/throttle.ts`, `throttle.test.ts`
- Modify: `apps/studio/src/features/project/folder-node.tsx` (badge on linked project roots), `apps/studio/src/features/home/project-grid.tsx` (badge on cards)
- Modify: `apps/studio/src/i18n/locales/en/project.json`, then `bun run i18n:types`

**Interfaces:**
- Consumes: `GitSync.status`, `useRepoLink`, FileSystem events (`file:*`, `folder:*`, `fs:reloaded`).
- Produces:
  - `createRemoteThrottle(intervalMs: number, now: () => number): { shouldCheck(projectId: string): boolean }` — `true` at most once per `intervalMs` per project; interval **30 000 ms**
  - `useRepoStatus(projectId: string): { state: SyncState; localChanges: number; remoteAhead: boolean | null } | null` (null = not linked). Local status is recomputed on file events (debounced 500 ms); the remote is checked on mount and on `window` `focus`, gated by the shared throttle
  - `<SyncStatusBadge projectId />` — nothing when unlinked; icon + tooltip for `in_sync` / `local` (with count) / `remote` / `diverged`; a failed remote check shows the local state only, with no error toast

- [ ] **Step 1: Write the failing test**

```ts
it("allows one remote check per project per interval", () => {
  let t = 0; const th = createRemoteThrottle(30_000, () => t);
  expect(th.shouldCheck("p")).toBe(true);
  expect(th.shouldCheck("p")).toBe(false);
  expect(th.shouldCheck("q")).toBe(true);
  t = 30_000; expect(th.shouldCheck("p")).toBe(true);
});
```

- [ ] **Step 2: Run, expect FAIL; implement; run, expect PASS.**
- [ ] **Step 3: Implement hook and badge, place them in the sidebar and the project grid; add the en keys; run `bun run i18n:types`.**
- [ ] **Step 4: Verify** — tests and `bun run build` pass. In `bun dev` the badge goes from in sync to local changes after an edit, to remote ahead after a GitHub edit plus window focus, and back to in sync after pull + push. Deleting a linked project removes its link (no stale badge on a new project).
- [ ] **Step 5: Commit** `feat(git-sync): sync status badge`.

---

### Task 11: Translations, user docs, changelog

**Files:**
- Modify: `apps/studio/src/i18n/locales/{de,es,fr,it,pt-BR,ru,uk,zh-CN}/project.json` (`git.*`)
- Create: `docs/git-sync.md`
- Modify: `apps/studio/README.md` (one-line pointer like the AI Assistant section), `CHANGELOG.md` (new top section `## Unreleased`)

- [ ] **Step 1: Translate every `project.git.*` key into the 8 locales** following `src/i18n/GLOSSARY.md`; keep keys, `{placeholders}` and `` `code` `` unchanged; "GitHub", "Commit", "Push", "Pull" stay as product terms where the glossary has no entry.
- [ ] **Step 2: Verify** — `cd apps/studio && bun test src/i18n` passes and `bun run i18n:report` shows `project` complete for all locales.
- [ ] **Step 3: Write `docs/git-sync.md`** covering:
  - the marker file and its `format`, and several projects per repo;
  - what is tracked and what is left alone;
  - how to create the token (fine-grained, "Contents: read and write") and where it is stored;
  - the import, initialize, link, pull, conflicts, Undo pull and push flows, and "pull first";
  - that the assistant cannot sync;
  - limits: GitHub only, no branches/PRs in Studio, empty folders are not pushed, generated `.asm` files are tracked like any other.
- [ ] **Step 4: Add the changelog entry** under `## Unreleased` and the README pointer.
- [ ] **Step 5: Commit** `docs(git-sync): translations, guide and changelog`.
