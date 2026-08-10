# File & Project Management (Sidebar CRUD) — Design

**Date:** 2026-08-10
**Status:** Approved (design), pending implementation plan
**Context:** After SCD removal, files are only created at project creation (one
`.smart.c`). The sidebar's per-project/per-file context menus exist but are mostly
unwired. This is the first step of the "files & project management" work (before the
companion daemon).

---

## 1. Problem

The active file store is the `FileSystem` class (`lib/file-system/file-system.ts`, via
`useFileSystem()`; metadata in `localStorage["scd:fs-metadata"]`, content in IndexedDB).
The sidebar (`LeftSidebar` → `ProjectSidebarItem` → `FileSidebarItem`) lists top-level
folders as "projects" and their files, and opens files at
`/projects/<folderId>/files/<fileId>`. But:

- **Project "Add File"** → `onClick={() => {}}` (stub). No way to create a `.smart.c`
  (or scenario) file manually.
- **Project "Rename"** → stub.
- **Project "Delete"** → wired to the **legacy** `deleteProjectAtom`
  (`stores/project-atoms.ts`, `localStorage["scd:projects"]`), which the sidebar does
  **not** read — so it doesn't actually remove the folder. Latent bug.
- **File "Rename"** → stub; `FileSystem` has no `renameFile`.
- File "Delete" already works (`fs.deleteFile`).

## 2. Goal

Wire full sidebar CRUD against the `FileSystem`: create files (SmartC/Scenario), rename
folders + files, and delete folders correctly.

## 3. Architecture

- **`FileSystem.renameFile(fileId, newName)`** (new) — updates the file's `name` and
  `path` (`<folderPath>/<newName>`), bumps `lastModified`, emits a new `file:renamed`
  event. Mirrors the existing `renameFolder`. Add `"file:renamed"` to
  `FileSystemEventType` (the `emitEvent` wildcard already re-dispatches any `file:*`).
  `type` is unchanged (file-type routing keys on `metadata.type`, not the name).
- **Pure `features/project/file-naming.ts`** (unit-tested):
  - `withExtension(base, ext)` → ensures exactly one trailing `ext` (e.g.
    `withExtension("foo", ".smart.c")` → `"foo.smart.c"`; idempotent).
  - `uniqueName(name, existing, ext?)` → dedupes against `existing` by inserting
    `-2`, `-3`, … before `ext` (mirrors the "New Scenario" behaviour).
- **`features/project/new-file-dialog.tsx`** — `NewFileDialog`: a name `Input` + a type
  `Select` (SmartC / Scenario). On submit, computes `uniqueName` and calls back with the
  final name, `FileTypes` value, and starter content.
- **`features/project/name-input-dialog.tsx`** — `NameInputDialog`: a generic prefilled
  name prompt (title, label, initial value, submit label, `onSubmit(name)`), reused for
  folder- and file-rename. Submit disabled when the trimmed value is empty or equal to
  the initial value.

### Component wiring
- `project-sidebar-item.tsx`:
  - **Add File** → open `NewFileDialog`; on submit
    `await fs.addFile(folderId, name, type, content)` then
    `navigate('/projects/<folderId>/files/<newId>')` and expand the folder.
  - **Rename** → open `NameInputDialog` (initial = folder name) →
    `fs.renameFolder(folderId, newName)`.
  - **Delete** → `fs.deleteFolder(folderId)` (replace the legacy
    `deleteProjectAtom`; remove that import), keep the existing `ConfirmationDialog`.
- `file-sidebar-item.tsx`:
  - **Rename** → open `NameInputDialog` (initial = file name) →
    `fs.renameFile(fileId, newName)`.
  - **Delete** → unchanged (`fs.deleteFile`).

Starter content: SmartC → `"// New Signum SmartC contract — start coding here.\n"`;
Scenario → `serializeScenario(defaultScenario())` (from `scenario/scenario-io`).
Extensions: SmartC → `.smart.c`, Scenario → `.scenario.json`.

## 4. Data flow

```
menu → dialog → fs.addFile / fs.renameFolder / fs.renameFile / fs.deleteFolder
     → FileSystem emits file:*/folder:* event
     → LeftSidebar (listening file:* / folder:*) re-lists folders → tree refreshes
create → also navigate() to the new file; rename/delete just refresh
```

## 5. Error handling

- **Create**: empty name disables submit; the name is sanitised
  (`replaceWhitespace`) and deduped via `uniqueName`, so creation never collides.
- **Rename**: submit disabled on empty or unchanged; if the new name collides with a
  sibling of the same kind, block with an inline message. `fs` errors surface via
  `toast`.
- **Delete folder**: confirmation dialog (unchanged); `fs.deleteFolder` recursively
  removes contents + content blobs (already implemented).

## 6. Testing

- **`file-naming.test.ts` (bun:test):** `withExtension` (adds when missing, idempotent,
  handles the double-dot `.smart.c`); `uniqueName` (no collision → unchanged; collision →
  `-2`/`-3`; with and without `ext`).
- **`FileSystem.renameFile`, dialogs, and menu wiring:** no browser-fs unit harness in
  this repo (`localStorage`/IndexedDB absent under bun test) — verified by `bun run build`
  + manual (create SmartC + scenario files, rename folder + file, delete folder; confirm
  the tree refreshes and the file opens).

## 7. Out of scope (deferred)

- Removing the now-dead legacy `stores/project-atoms.ts`.
- Drag/move files between folders (`fs.moveFile` exists; no UI).
- Nested-folder rendering in the tree (the store supports it; the sidebar shows one
  level).
- Per-file active-state highlight in the tree.
