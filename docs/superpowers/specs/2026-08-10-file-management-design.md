# File & Project Management (Project Explorer) — Design

**Date:** 2026-08-10
**Status:** Approved (design), pending implementation plan
**Context:** After SCD removal, files are only created at project creation (one
`.smart.c`), the sidebar's context menus are mostly unwired, and the tree shows a single
level. This turns the sidebar into a proper **project explorer** — the foundation for
multiple contracts + unit-test files per project, which later matters for
simulation/debugging. First step of "files & project management" (before the daemon).

---

## 1. Problem

The active file store is the `FileSystem` class (`lib/file-system/file-system.ts`, via
`useFileSystem()`; metadata in `localStorage["scd:fs-metadata"]`, content in IndexedDB).
The sidebar (`LeftSidebar` → `ProjectSidebarItem` → `FileSidebarItem`) lists root-level
folders as "projects" and, one level deep, their files. Gaps:

- **Project "Add File"** and **"Rename"** → `onClick={() => {}}` (stubs).
- **Project "Delete"** → wired to the **legacy** `deleteProjectAtom`
  (`stores/project-atoms.ts`, `localStorage["scd:projects"]`), which the sidebar does not
  read → the folder is not actually removed. Latent bug + a dead parallel store.
- **File "Rename"** → stub; `FileSystem` has no `renameFile`.
- **No nested folders** in the UI (the store supports them), **no "New Folder"**, and **no
  way to move files** between folders (`fs.moveFile` exists, no UI).
- File "Delete" already works (`fs.deleteFile`).

## 2. Goal

A recursive project explorer with full CRUD + drag-to-move:

- **Nested folders** rendered to arbitrary depth; **New Folder** creates a subfolder in
  any folder.
- **New File** (SmartC / Scenario) in any folder.
- **Rename / Delete** for folders and files at any depth (Delete folder fixed to use the
  `FileSystem`).
- **Move files** between folders via **drag & drop** (files are drag sources; folders are
  drop targets; uses `fs.moveFile`). Folders are not moved (deferred).
- Active file is highlighted in the tree. The dead legacy `stores/project-atoms.ts` is
  removed.

## 3. Architecture

### FileSystem
- **`renameFile(fileId, newName)`** (new) — updates `name` + `path`
  (`<folderPath>/<newName>`), bumps `lastModified`, emits a new **`file:renamed`** event
  (add it to `FileSystemEventType`; `emitEvent` already re-dispatches any `file:*` to
  `file:*` listeners). `type` is unchanged (routing keys on `metadata.type`, not name).
- Everything else needed already exists: `addFile`, `createFolder(parentPath, name)`,
  `deleteFolder`, `renameFolder`, `moveFile(fileId, targetFolderId)`,
  `listFolderContents(folderId)`, `getFolder(folderId)`, plus `file:moved` events.

### Pure helper `features/project/file-naming.ts` (unit-tested)
- `withExtension(base, ext)` → exactly one trailing `ext` (idempotent; handles the
  double-dot `.smart.c`).
- `uniqueName(name, existing, ext?)` → dedupes against `existing` by inserting `-2`,
  `-3`, … before `ext` (mirrors "New Scenario"). Used for files (with ext) and folders
  (no ext).

### Tree components
- **`FolderNode`** (new, recursive) replaces `ProjectSidebarItem`. Renders a folder row
  (expand/collapse chevron, folder icon, name, `⋮` menu) with depth-based indentation;
  when expanded, lists **subfolders** (recursive `FolderNode`) then **files**
  (`FileSidebarItem`), from `fs.listFolderContents(folder.id)`. Local `expanded` state,
  keyed by folder id (survives sidebar re-renders). Menu: **Add File**, **New Folder**,
  **Rename**, **Delete**.
  - `LeftSidebar` maps root folders → `<FolderNode folder depth={0} />` (a "project" is a
    depth-0 folder). The header keeps **New Project** (`NewProjectDialog` → root folder +
    one starter `.smart.c`, unchanged).
  - **Drop target:** `onDragOver` (preventDefault when the drag carries our file MIME →
    show a highlight) + `onDrop` → `fs.moveFile(fileId, folder.id)`.
- **`FileSidebarItem`** (extended): accepts `depth` (indentation) + `isActive`; is a
  **drag source** (`draggable`, `onDragStart` sets `dataTransfer` `application/x-smartc-fileid`
  = fileId). Menu: **Rename** (→ `NameInputDialog` → `fs.renameFile`), **Delete**
  (unchanged, `fs.deleteFile`). Clicking opens `/projects/<folderId>/files/<fileId>`.

### Dialogs
- **`NewFileDialog`** — name `Input` + type `Select` (SmartC / Scenario). Computes
  `uniqueName` against sibling file names; returns final name + `FileTypes` value +
  starter content. SmartC → `.smart.c` + `"// New Signum SmartC contract — start coding here.\n"`;
  Scenario → `.scenario.json` + `serializeScenario(defaultScenario())`.
- **`NameInputDialog`** — generic prefilled name prompt (title, label, initial value,
  submit label, optional `validate(name) => string | null`). Reused for New Folder,
  folder-rename, file-rename. Submit disabled on empty/unchanged or when `validate`
  returns an error (used to block sibling-name collisions).

### Active highlight
`FileSidebarItem` receives `isActive = useParams().fileId === file.id` (read in the tree
from the route) so the open file is highlighted.

## 4. Data flow

```
menu/dialog/drag → fs.addFile | createFolder | renameFile | renameFolder
                 | deleteFile | deleteFolder | moveFile
  → FileSystem emits file:* / folder:* → LeftSidebar (file:* / folder:* listener)
    re-lists root folders → FolderNodes re-list their contents → tree refreshes
create-file → also navigate() to the new file + expand its folder
```

## 5. Error handling

- **Create file/folder:** empty name disables submit; names are sanitised
  (`replaceWhitespace`) and deduped via `uniqueName`, so creation never collides.
- **Rename:** submit disabled on empty/unchanged; `validate` blocks a sibling-name
  collision with an inline message. `fs` errors → `toast`.
- **Delete folder:** confirmation dialog; `fs.deleteFolder` recursively removes contents +
  content blobs (already implemented).
- **Drag & drop:** only accept a drop carrying the file MIME; dropping onto the file's
  current folder is a no-op (`moveFile` returns early). No folder-into-itself case (folders
  aren't dragged).

## 6. Testing

- **`file-naming.test.ts` (bun:test):** `withExtension` (adds when missing, idempotent,
  `.smart.c` double-dot); `uniqueName` (no collision → unchanged; collision → `-2`/`-3`;
  with and without `ext`).
- **`FileSystem.renameFile`, tree recursion, dialogs, drag & drop:** no browser-fs unit
  harness in this repo (`localStorage`/IndexedDB absent under bun test) — verified by
  `bun run build` + manual: create nested folders, create SmartC + scenario files at
  depth, rename folder + file, delete folder, drag a file into another folder, confirm the
  tree refreshes, the active file is highlighted, and the file opens.

## 7. Out of scope (deferred)

- **Moving folders** (needs a new recursive `fs.moveFolder` with cycle protection) — files
  only for now.
- A "Move to…" menu (drag & drop is the chosen UX).
- Reordering siblings; multi-select; cut/copy/paste.
