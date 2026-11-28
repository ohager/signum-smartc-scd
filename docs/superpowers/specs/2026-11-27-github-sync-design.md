# GitHub Sync — Design

**Date:** 2026-11-27
**Status:** Draft, awaiting approval

## Intent

The Studio workspace lives only in the browser (metadata in `localStorage`, contents in
IndexedDB). Getting work out or in is a manual ZIP round-trip (`lib/file-system/transfer.ts`).
That is fine for small experiments, but for a real contract project (the trigger:
migrating `veridibloc/smart-contracts` into Studio) you lose versioning, collaboration via
GitHub, and you carry the risk that clearing site data wipes the work.

Studio will **not** grow its own versioning. Instead a Studio project can be **linked to a
GitHub repository** and synced with it: import a repo as a project, pull remote changes,
commit and push local changes. Git stays the source of history.

## Goals

1. **Import from GitHub:** create a new Studio project from a *Studio repo* (a folder
   carrying a `.smartc-studio` marker) on `owner/repo` + branch.
2. **Initialize a repo as a Studio repo:** add the marker to a repo (or a folder in it) that
   does not have one yet — e.g. an existing contract repo like `veridibloc/smart-contracts`.
3. **Link an existing project** to a (typically empty) repo; the first push is the export
   and writes the marker.
4. **Commit & Push** the project's changes directly to the linked branch.
5. **Pull** remote changes into the project, with per-file conflict resolution.
6. **Sync status** per linked project: local changes, remote ahead, both, in sync.
7. Works in every browser Studio supports, with no local tools.

## Non-goals (v1)

- No Studio-internal history or versioning.
- No branch switching, branch creation or pull requests: the user does that on GitHub.
- No GitLab/Gitea/Bitbucket — but the provider sits behind an interface so they can be
  added as adapters later.
- No line-level merge; conflicts are resolved per file ("mine" / "theirs").
- No OAuth; a personal access token only.
- No automatic/background sync; pull and push are explicit actions.
- No binary files.

## Anti-goals (failure even if it "works")

- **A push deletes or rewrites files Studio does not know** (`README` aside, e.g.
  `.github/`, `package.json`, CI configs, images). Must be impossible by construction.
- **The AI assistant can pull, push or read the token.** Like wallets and deployment, Git
  sync is outside the assistant's tool set; no tool may expose it.
- **Silent loss of local or remote work** on pull or push.
- The token leaves the browser for anywhere other than `api.github.com`.

## Constraints

- Studio is a static SPA (Bun build, hosted on Vercel); there is no backend in v1.
- `github.com`'s git smart-HTTP endpoints send no CORS headers, so `isomorphic-git` would
  need a proxy. The GitHub REST API (`api.github.com`) is CORS-enabled → use it.
- A Studio project is a top-level folder (`features/project/project-root.ts`).
- The workspace syncs across tabs via the `storage` event (`content-store.ts`); sync state
  must not diverge between tabs.
- During an assistant round the project is locked (`docs/assistant.md`); sync actions
  must respect that lock.
- All UI text goes through i18n (`en` source, 9 locales; see `apps/studio/README.md`).

## Approaches (the user picked A)

- **A. GitHub REST API from the browser.** Import, pull and push in Studio, token auth.
  Works everywhere, matches "import/export a repo inside Studio". Costs: GitHub-only at
  first, token stored in the browser, we build conflict detection ourselves.
- **B. Local folder mirror** (File System Access API) linked to a git checkout; git runs
  outside. Any host, full git, little code — but Chromium only, permission prompt each
  session, two-sided edit conflicts.
- **C. The relay as bridge** (`@smartc-studio/mcp` mirrors to disk). All browsers, but needs
  Node and a running relay, and widens the relay's deliberately disk-free security model.

A ZIP-from-git-URL import was dropped: it is today's ZIP path with extra steps.

## Decided with the user

- Provider: **GitHub** now; GitLab and others later as adapters.
- Workflow: **push directly to the linked branch**; branches/PRs happen on GitHub.
- No own versioning in Studio.
- Compatibility is declared by a **marker file `.smartc-studio` with a version number**;
  files are checked for valid extensions when loading; a repo **can be initialized** as a
  Studio repo.

## Design

### The Studio repo marker

A folder is a **Studio project root** in a repo when it contains a file `.smartc-studio`:

```json
{ "format": 1 }
```

- `format` is the version of the Studio repo layout. Studio reads `format ≤` its own
  supported version; a higher one refuses import/pull/push with "This repo needs a newer
  Studio". The object may gain optional keys later (e.g. ignore patterns) without a format
  bump; unknown keys are preserved, never stripped.
- The marker can sit at the repo root or in any sub-folder, and a repo may hold **several**
  markers = several Studio projects (e.g. one per contract family). The folder holding the
  marker is the link's `path`.
- The marker is not a workspace file: Studio does not show it in the tree, keeps its
  parsed content in the `RepoLink`, never deletes it on push, and only writes it when
  initializing.
- Invalid or unparsable marker → treated as "not a Studio repo" with the parse error shown;
  the user can re-initialize (overwrites the marker in a commit of its own, after
  confirmation).

### Link model

A linked project stores a **sync record**:

```ts
interface RepoLink {
  provider: "github";
  owner: string;
  repo: string;
  branch: string;
  path: string;              // folder holding .smartc-studio; "" = repo root, no leading/trailing slash
  format: number;            // marker format version
  baseCommit: string;        // commit SHA of the last successful pull/push
  baseFiles: Record<string, string>; // repo-relative path (under `path`) → git blob SHA at baseCommit
}
```

Studio sub-folders map 1:1 to repo paths below `path`.

### Which files take part ("tracked files")

Only files below the marker folder. Within it, exactly the files Studio can hold in a project: what `acceptedFileType` accepts (`.smart.c`,
`.asm`, `.scenario.json`, `.labels.json`, `.inspect.json`, `.ts`) plus `.md` (Studio's `Doc`
type), and only if the content is UTF-8 text (`decodeTextOrNull`). Everything else in the
repo is **untracked**: never downloaded, never stored, never touched. When loading
(import, pull) the extension and UTF-8 check runs on every file below the marker; files
that fail it are skipped and **reported** ("Imported N files, M skipped: …"), as the ZIP
import does today — but on the remote they stay untouched.

`.ts` matches any TypeScript file, including tooling (`vitest.config.ts`, scripts). Where
the marker sits is the user's lever to scope the project to the contract folder. Ignore
patterns in the marker are a possible later addition, not v1.

### Detecting changes without storing old contents

Git blob SHAs are computable locally: `sha1("blob " + byteLength + "\0" + bytes)`. So:

- **local change** of a file = `blobSha(local content) !== baseFiles[path]` (or the path is
  new / gone locally),
- **remote change** = the remote tree's SHA for the path `!== baseFiles[path]`.

No copy of the base contents is needed.

### Import

1. User enters `owner/repo` and picks a branch (default branch preselected).
2. Resolve the branch head (`GET /repos/{o}/{r}/branches/{b}`), then the recursive tree.
3. Find every `.smartc-studio` in the tree and fetch/parse them. One → use it; several →
   the user picks the project folder; none → offer **Initialize** (below).
4. Filter to tracked files under the marker folder; fetch their blobs
   (`GET /git/blobs/{sha}`, base64).
5. Create the project folder and files (reuse `FileTransfer.importEntries`-style logic; the
   type comes from the same resolver) and report skipped files.
6. Store the `RepoLink` with `baseCommit`, `baseFiles` and `format`.

### Initialize a repo as a Studio repo

For a repo (or folder) without a marker:

1. The user picks the folder that becomes the project root (repo root preselected; the
   dialog shows how many files below it are tracked vs. skipped, so a tooling-heavy root is
   visibly a poor choice).
2. After confirmation Studio makes **one commit containing only the marker**
   (`Initialize SmartC Studio project`), fast-forward, no force — so the repo's history
   shows exactly what initialization did and nothing else changes.
3. Then it continues as a normal import from that commit.

Initializing into an **empty repo** (no commits) creates the first commit with the marker
and the ref (`POST /git/refs`). Initializing needs write access; with a read-only token the
dialog says so before anything happens.

### Pull

1. Fetch the branch head. If it equals `baseCommit`, done. If the marker at `path` is gone
   or its `format` is unsupported, stop and say so — nothing is applied.
2. Diff the remote tracked files against `baseFiles`, and the local ones too (blob SHAs).
3. Per path:
   - only remote changed → take remote (add / update / delete locally),
   - only local changed → keep local,
   - both changed to the same blob → nothing to do,
   - both changed differently (including edit-vs-delete) → **conflict**.
4. Conflicts open a dialog listing the files; per file the user views a diff and chooses
   *mine* or *theirs*. Nothing is written until every conflict has a choice (or the user
   cancels the whole pull).
5. **Take a checkpoint before applying** (reuse `features/assistant/rounds/checkpoints.ts`
   capture/restore) and offer **Undo pull** in the toast.
6. Update `baseCommit` to the remote head and `baseFiles` to the remote tree's tracked
   files. Files where the user chose *mine* now count as local changes, ready to push.

### Commit & Push

1. Require a commit message (pre-filled suggestion, e.g. listing changed files).
2. Fetch the branch head. If it is not `baseCommit` → refuse: "The branch moved on GitHub —
   pull first."
3. Create blobs for added/changed tracked files; build a tree with
   **`base_tree = baseCommit's tree`**, entries for changed files and `sha: null` for files
   deleted in Studio. Untracked repo files are inherited from the base tree unchanged —
   this is what makes the first anti-goal impossible.
4. Create the commit (parent `baseCommit`), then move the ref with
   `PATCH /git/refs/heads/{b}` **without `force`**. If GitHub rejects it as non-fast-forward
   (someone pushed in between), report "pull first"; nothing is lost locally.
5. Update `baseCommit` and `baseFiles`.

### Export (link an existing project)

"Link to GitHub" on an existing project: owner/repo/branch and the target folder.

- Target folder has a marker → link to it like an import, with every overlapping file a
  potential conflict (pull semantics), then push as usual.
- No marker → the link is an initialization: `baseCommit` = branch head (or none for an
  empty repo), `baseFiles = {}`, and the **first push writes the marker together with all
  project files** in one commit. If the target folder already contains files that would be
  tracked, the dialog lists them and the link proceeds with pull semantics so nothing is
  overwritten silently.
- Empty repo (no commits): the first commit has no parent and the ref is created
  (`POST /git/refs`).

### Status

Shown on the linked project (sidebar project node, project header, home grid card):
in sync / N local changes / remote ahead / both. Local state updates on every file event;
the remote head is checked on project open and on window focus (one cheap request).

### Authentication

- One fine-grained personal access token (`Contents: read and write` on the chosen repos),
  entered in a Studio settings dialog, stored in `localStorage` under its own key.
- Token is sent only in requests to `api.github.com`. The dialog says plainly where it is
  stored and links to GitHub's token page.
- Validate on save (`GET /user` or the repo) and show the login + scope problems.
- OAuth (via a small Vercel function for the code exchange) is a later step; the provider
  interface keeps auth swappable.

### Interplay with the assistant

- Pull and push are refused while an assistant round runs on that project (the project is
  locked anyway); the UI disables them with the lock's reason.
- A pull is a user change: after it the assistant's next write gets `user_took_over`, as
  after a restore.
- No assistant tool for sync, and the token store is not readable through any tool.

### Structure

Following the transfer precedent: a **headless core** in `lib/` (no DOM/React), with the
UI in `features/`.

- `lib/git-sync/` — `RepoLink` storage, blob SHA, change detection, pull planning
  (pure: inputs are base, local, remote → plan with actions and conflicts), push building.
- `lib/git-sync/providers/github.ts` — the REST calls behind a `GitProvider` interface
  (`getHead`, `getTree`, `getBlob`, `createBlob`, `createTree`, `createCommit`,
  `updateRef`, `createRef`).
- `features/git-sync/` — token dialog, import dialog, link dialog, commit dialog, conflict
  dialog, status badge.

The pull planner and push builder get thorough unit tests with a fake provider and fake
file system (same structural-interface style as `TransferFs`).

## Left to the builder

- Where exactly the actions sit in the UI (project context menu, project header, home
  page next to ZIP import) and how the dialogs look — following the design language spec.
- Storage location of `RepoLink` (folder metadata extension vs. its own key), as long as
  it stays consistent across tabs.
- Blob fetching strategy (per-blob requests vs. batching) and rate-limit handling
  (show GitHub's reset time on 403/429).
- Line endings: store and push contents byte-for-byte as received/edited; no normalisation.
- Empty folders: git does not track them; a pushed empty Studio folder simply does not
  appear in the repo. Mention it in the docs.
- Case-only renames and renames in general are delete + add; fine for v1.
- Large repos: the recursive tree can be truncated by GitHub; if `truncated`, fall back to
  walking the tree from the chosen folder, or fail with a clear message.
- Nested markers (a marker below another marker's folder): v1 may simply refuse such a
  layout with a clear message.

## Addendum (2026-11-27): a new project into a folder that does not exist yet

**Need (user):** start with contract A linked to `contracts/a`, create contract B in Studio,
and write B into the same repo. With only existing folders offered for initialization,
there is no place for B (root and `contracts/` are blocked by A's marker below them).

**Decided with the user:**

- **Link dialog:** initializing accepts a **new folder path** typed by the user, besides the
  existing free folders. Prefilled with a sibling of the first valid marker folder, named
  after the project (`contracts/a` + project "B" → `contracts/b`); without markers, the
  project name at the repo root. Names are slugged (lowercase, spaces → `-`, unsafe
  characters dropped); the user can edit.
- **Validation** (UI and service): relative path, no leading/trailing `/`, no empty, `.` or
  `..` segments, no `\`; no marker above or below it; no file on GitHub at the path or at
  any of its parent folders. An existing folder without a marker below/above stays allowed.
- Flow unchanged: one commit with only `<folder>/.smartc-studio` (Contents API creates the
  folders), then the normal link → (empty) pull → push.
- **Import dialog:** "Initialize" is offered whenever at least one existing folder can take a
  marker — not only when the repo has no marker. (Import keeps to existing folders; a new
  empty folder would import nothing.)
- Not in scope: initializing several folders in one commit, importing all marker folders at once.
