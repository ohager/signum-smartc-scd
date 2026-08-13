# Home Page — Design

**Date:** 2026-08-13
**Status:** Approved (design), pending implementation plan
**Context:** The `/` route is currently a placeholder (`<h1>TO DO: some home page</h1>` in
`App.tsx`). This design replaces it with a real home page. Follows the file-transfer work
(commits `8db940b`..`665b16d`).

---

## 1. Goal

Give the `/` route one page that serves both audiences named in the product direction:

- A **newcomer** arriving at the hosted deploy with an empty workspace gets an
  introduction, a single obvious way to start, and a route into learning material.
- A **returning developer** gets a launcher: what they were last working on, their
  projects, and the actions that create or import work.

The same route serves both. Which face it shows is derived from the workspace, not stored.

The page also closes a live navigation gap: **nothing in the UI currently links to `/`**.
The only reference is a programmatic `<Navigate to="/" replace />` in `FilesPage` when a
file fails to load, so today home is unreachable once a file is open.

## 2. Scope

This spec covers the **Home Page only**.

An in-app **Learning Hub** (tutorial pages, video detail views, a clonable example-contract
gallery) is a separate sub-project with its own content model and routes, and gets its own
brainstorm → spec → plan cycle. The home page is designed so the hub slots in behind an
interface that already exists: a typed learning content index (§5.3). The home page reads
the first few entries; the hub will own the full list and the detail views.

Out of scope here: tutorial pages, video detail views, example-contract cloning, the
testbed itself, any change to the editors, debugger, or deployment flow.

## 3. Layout

The route stays inside `AppLayout`, so the left sidebar (project tree + wallet card) and
`Toaster` are unchanged and present on this page as on every other.

Chosen shape: **hero band on top, main column plus a persistent Learn rail below.** The
hero is one component in two sizes, which is what lets the empty state be *the same page at
a different scale* rather than a second page to design and maintain.

### 3.1 Empty state (no projects)

```
┌──────────┬────────────────────────────────────────────┬─────────────┐
│ sidebar  │                                            │             │
│          │            ◈ SmartC Studio                 │   Learn     │
│ ◈ Home   │   Write, simulate and deploy Signum        │  ▶ video    │
│ Projects │   smart contracts — in your browser.       │  ▶ video    │
│  (none)  │                                            │  → docs     │
│          │  [+ Create your first contract] [Import]   │  → community│
│          │                                            │             │
│ wallet   │  HOW IT WORKS                              │             │
│  card    │  ┌────────┬────────┬─────────┬──────────┐  │             │
│          │  │1 Write │2 Test  │3 Simul. │4 Deploy  │  │             │
│          │  └────────┴────────┴─────────┴──────────┘  │             │
└──────────┴────────────────────────────────────────────┴─────────────┘
```

### 3.2 Dashboard state (workspace has projects)

```
┌──────────┬────────────────────────────────────────────┬─────────────┐
│ sidebar  │  ◈ SmartC Studio    [+ New Project][Import]│             │
│          ├────────────────────────────────────────────┤   Learn     │
│ ◈ Home   │  CONTINUE WHERE YOU LEFT OFF               │  ▶ video    │
│ Projects │   vault.smart.c · vault        2 min ago   │  ▶ video    │
│  · stock │   vault.scenario.json · vault  18 min ago  │  → docs     │
│  · token │   token.smart.c · token        yesterday   │  → community│
│  · vault ├────────────────────────────────────────────┤             │
│          │  PROJECTS                                  │             │
│ wallet   │   ┌────────┐ ┌────────┐ ┌────────┐         │             │
│  card    │   │ stock  │ │ token  │ │ vault  │         │             │
│          │   └────────┘ └────────┘ └────────┘         │             │
│          ├────────────────────────────────────────────┤             │
│          │  HOW IT WORKS  (1 Write · 2 Test · …)      │             │
└──────────┴────────────────────────────────────────────┴─────────────┘
```

On narrow viewports the Learn rail stops being a rail and stacks below the main column.

### 3.3 Block visibility

| Block | Empty state | Dashboard state |
|---|---|---|
| `Hero` | `variant="full"` — centred, fills the column | `variant="band"` — compact top band |
| `HowItWorks` | shown | shown |
| `ContinueList` | hidden | shown when recents are non-empty |
| `ProjectGrid` | hidden | shown |
| `LearnRail` | shown | shown |

`HowItWorks` appears in both states deliberately. It is static copy with no data behind it,
and it is the only place in the UI that reveals the simulator/debugger exist at all.

### 3.4 "How it works" copy

Four steps, reflecting the intended workflow (steps 1–3 loop):

1. **Write** — SmartC editor with completion, hover docs and live compiler diagnostics.
2. **Test** — automated contract tests via the testbed. **Marked "soon".**
3. **Simulate** — step through against a scenario: breakpoints, variables, mock ledger.
4. **Deploy** — connect your wallet and publish to Signum testnet or mainnet.

Write, Simulate and Deploy are all implemented today (`smartc-editor`, `simulator`,
`deployment-flow.tsx`'s real `publishContract`). **Test is not** — `src/features/testbed/`
is an empty placeholder directory. Step 2 therefore carries a "soon" badge and copy in the
future tense. When the testbed lands, the badge is deleted and nothing else changes.

## 4. Module layout

```
src/pages/home/home-page.tsx        route component: reads FS + recents, picks state, composes
src/features/home/
  hero.tsx                          identity + pitch + CTAs; variant="full" | "band"
  how-it-works.tsx                  static 4-step strip
  continue-list.tsx                 recently opened files
  project-grid.tsx                  project cards
  learn-rail.tsx                    video cards + outbound links
  recent-files.ts                   headless: recents ring buffer, DOM-free
  project-summary.ts                headless: recursive project stats + main-file pick
  learn-content.ts                  typed content index (data only)
src/hooks/use-recent-files.ts       React binding over recent-files.ts
```

This follows the pattern the codebase already uses — pure, tested, DOM-free logic in a
module with thin UI callers on top, as in `file-naming.ts`, `tree-reveal.ts` and
`transfer.ts`. Each UI block stays small enough to read in one screen; all non-trivial
logic lives in the two headless modules.

Rejected alternatives: a single large `home-page.tsx` (a hero, a four-step strip, two lists
and a rail is 300–400 lines of JSX in one file, and welds the recency logic to rendering
where it can't be tested); and putting the blocks in `components/ui/` (that directory holds
generic shadcn primitives, these are home-specific).

## 5. Headless logic

### 5.1 `recent-files.ts`

There is **no "recently opened" data in the app today** — `FileMetadata` carries only
`lastModified`. This module adds it as a `localStorage`-backed ring buffer.

An entry is **`{ fileId, openedAt }` and nothing else.** Name, type and owning project are
resolved live at render through `fs.getFileMetadata(fileId)` and
`fs.getFolderIdOfFile(fileId)`. This is deliberate: storing the name would go stale the
moment a file is renamed, and storing the project id would go stale on a drag-and-drop
move — both of which the app supports today. Resolving live also collapses staleness and
pruning into one code path: metadata resolves to `null` → the entry is dropped.

API, pure over an injected `StorageLike { getItem, setItem }` (tests pass a `Map`-backed
fake, mirroring how `FileTransfer` takes a structural `TransferFs`):

- `readRecents(storage): RecentEntry[]` — parse; return `[]` on absent, malformed or
  unparseable data. Never throws.
- `recordOpen(storage, fileId, openedAt): void` — dedupe by `fileId`, move to front, cap at
  **8**.
- `pruneRecents(recents, exists): RecentEntry[]` — drop entries whose `fileId` no longer
  resolves.

### 5.2 `project-summary.ts`

`fs.listFolderContents()` is synchronous and only one level deep, so project stats need a
recursive walk — the same pure-walker shape as the existing `tree-reveal.ts`, over a
structural subset of `FileSystem`.

`summarizeProject(fs, folderId): ProjectSummary` returns
`{ id, name, fileCount, lastModified, mainFileId }`, where:

- `fileCount` and `lastModified` aggregate the whole subtree, not just the top level.
- `mainFileId` is the most recently modified `.smart.c` in the subtree; failing that, the
  most recently modified file of any type; `null` for a project with no files.

### 5.3 `learn-content.ts`

A bundled, typed constant — **no runtime fetching.** Compile-time checked, instant, works
offline, nothing to validate. Adding a video means adding an array entry and pushing.

```ts
type LearnKind = "video" | "link" | "guide" | "example";

interface LearnEntry {
  id: string;
  kind: LearnKind;
  title: string;
  blurb?: string;
  href?: string;        // outbound URL for link/video
  youtubeId?: string;   // video only
}
```

`guide` and `example` are declared now but unused. The Learning Hub sub-project will
populate them and render detail views without changing this shape. `LearnRail` renders only
`video` and `link` entries, in array order: **at most 3 videos, then at most 5 links.**
Entries beyond those caps, and entries of other kinds, are ignored by the rail.

Remote (GitHub-hosted JSON) sourcing was considered and rejected for now: because the
Vercel deploy is git-driven, editing content in this repo redeploys anyway, so the benefit
did not justify the fetch path, the fallback path, and a runtime validator for hand-edited
JSON.

## 6. Data flow

All local and synchronous. No network requests except the YouTube thumbnail images (§8).

- **State selection** — `fs.listFolderContents().folders.length === 0` → empty state, else
  dashboard. Derived per render; no flag, no persistence, no "dismissed" bookkeeping.
  Deleting the last project restores the welcome face, which is correct rather than a bug.
- **Projects** — `home-page.tsx` lists root folders and calls `summarizeProject()` per
  folder. It subscribes to `file:*` and `folder:*` and refreshes on both, exactly as
  `LeftSidebar` does, so create/delete/rename/move updates the grid live.
- **Recents (read)** — `useRecentFiles()` calls `readRecents()`, then
  `pruneRecents(recents, fs.exists)`, and writes the pruned list back so the buffer
  self-heals.
- **Recents (write)** — `FilesPage` calls `recordOpen()` inside its existing file-load
  effect, keyed on `fileId`. This is the only change to `FilesPage`.
- **Learn** — an imported constant. No async, no loading state, no error path.

## 7. Navigation wiring

- **Home entry point** — a `Home` row pinned above the `Projects` group in `LeftSidebar`,
  using `NavLink to="/"` with active highlighting consistent with `FileSidebarItem`. This
  is what makes `/` reachable at all.
- **Project card primary action** — navigate to `/projects/:projectId/files/:mainFileId`
  **and** set `revealFileRequestAtom` so the sidebar tree expands to the opened file,
  reusing the mechanism behind the existing Crosshair "select opened file" button. A
  project whose `mainFileId` is `null` renders the action disabled with a "no files" note,
  never a dead link.
- **Continue-list row** — same navigation, resolving the project id live via
  `fs.getFolderIdOfFile(fileId)`.
- **Hero CTAs** — `Create your first contract` / `New Project` opens the existing
  `NewProjectDialog`; `Import` triggers the existing top-level ZIP import path already
  implemented in `LeftSidebar` (`fs.transfer.importZip`). Both reuse existing components;
  neither is reimplemented.

## 8. Error handling and edge cases

- **Corrupt or unavailable `localStorage`** — `readRecents` returns `[]`; the Continue
  section is simply absent. Never throws, never blocks the page.
- **Deleted / renamed / moved recent file** — handled by live resolution plus prune (§5.1).
- **Empty project** — card shows `0 files` and a disabled open action.
- **Project deleted while home is open** — FS event subscription refreshes the grid.
- **Video thumbnails** — `img.youtube.com/vi/<id>/mqdefault.jpg`, with an `onError`
  fallback to a styled placeholder card so a failed image never leaves a broken frame.
  Accepted tradeoff: this issues one image request to Google on page load. Justified
  because the cards link to YouTube anyway.
- **`summarizeProject` on a folder that vanished mid-render** — `getFolder` throws by
  design; the grid maps over ids it just read in the same tick, and the FS event refresh
  re-reads, so this is not defended against beyond that.

## 9. Testing

`bun test` (root `"test": "bun test"`), with `*.test.ts` colocated beside sources as in
`file-naming.test.ts` and `transfer.test.ts`.

- **`recent-files.test.ts`** — dedupe by `fileId`; move-to-front on re-open; cap at 8;
  `pruneRecents` against a fake `exists`; malformed/absent storage → `[]`. All over a
  `Map`-backed `StorageLike` fake.
- **`project-summary.test.ts`** — recursive `fileCount` and `lastModified` across nested
  folders on an in-memory fake FS; `mainFileId` prefers `.smart.c` over a newer file of
  another type; falls back to newest-of-any-type; `null` for an empty project.
- **`learn-content.test.ts`** — ids are unique; every `video` entry has a `youtubeId`. A
  cheap guard against copy-paste mistakes in hand-maintained data.

**No component tests.** The repo has no React testing setup — no testing-library, no
jsdom — and adding that infrastructure is not in scope for this spec. The UI blocks are
verified manually. This matches existing practice in the codebase: headless logic is
tested, UI is not.

## 10. In-scope cleanups

Both are things a developer working in these files should fix rather than step around:

- **Delete `src/components/ui/layout/header.tsx`** — dead code, imported nowhere. The
  `Page` / `PageHeader` primitives in `components/ui/page.tsx` are what the app actually
  uses.
- **`NewProjectDialog` seeds its first file with `smartcStarter()`** — it currently writes
  a one-line `// New Signum SmartC contract — start coding here.` stub, while
  `NewFileDialog` already uses the rich annotated dispatch template. That is backwards for
  onboarding: the first contract a newcomer ever creates is the emptiest one. Since the
  home page's primary CTA drives straight into this dialog, fixing it is part of making the
  empty state work.

## 11. Success criteria

- Visiting `/` with an empty workspace shows the hero, the four-step strip and the Learn
  rail, and offers exactly one obvious primary action.
- Creating or importing a project flips the same route to the dashboard face with no reload.
- Opening files then returning to `/` lists them, most recent first, capped at 8, with
  names and projects correct after a rename or a move.
- `/` is reachable from anywhere via the sidebar Home row.
- Clicking a project card lands in that project's main contract with the sidebar tree
  expanded to it.
- Deleting a file or project updates the home page without a reload, and never leaves a
  row that navigates nowhere.
- `bun test` passes; `bun run build` succeeds.
