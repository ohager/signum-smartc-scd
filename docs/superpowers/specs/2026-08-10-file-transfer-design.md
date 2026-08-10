# File Transfer (Download / Upload / Import) — Design

**Date:** 2026-08-10
**Status:** Approved (design), pending implementation plan
**Context:** Follows the project-explorer work (commits `ff19f7e`..`f921b58`). Adds
download + upload/import, per file and per folder, to the sidebar.

---

## 1. Goal

- **Download** a single file (its text content) and a whole folder (a ZIP of the
  subtree) — from the sidebar, and also from each editor's page header (the open file).
- **Upload** file(s) into a folder; **Import** a folder as a ZIP or via the native
  directory picker; **Import** a whole project from a ZIP at the sidebar top level (new
  root folder).
- **Only UI-supported file types are accepted on the way in.** Everything else is
  filtered out and reported.

## 2. Accepted types

The app can open exactly three types (`files-page.tsx` routes them): **SmartC**
(`.smart.c`), **Scenario** (`.scenario.json`), **ASM** (`.asm`). On upload/import, each
incoming entry is mapped by extension to one of these or **rejected**. Rejected entries
(unknown extensions, `.md`, images, `.DS_Store`, no extension, …) are skipped; the UI
reports "Imported N files (M skipped)". Folders are created only for surviving files, so
junk directories never appear. Download is unrestricted (you can always take out what is
already in the workspace).

All accepted types are text (UTF-8). Binary is out of scope now, but the transfer layer
reads bytes and decodes to text, so binary support can be added later without reshaping
the API.

## 3. Dependency

Add **`fflate`** (`^0.8.3`, tiny zero-dependency zip) to `apps/studio` for ZIP build/parse.
Added by editing `apps/studio/package.json` + `bun install` (do **not** `bun update`; see
`[[bun-monorepo-dep-updates]]`). Imported only by `lib/file-system/transfer.ts`.

## 4. Modules

The transfer **core is headless** and lives inside `lib/file-system` (which stays 100 %
DOM/React-free); the UI (sidebar, editors) consumes it. The DOM bits (triggering a browser
download, reading `<input>` files) and the app's *type policy* live in the UI layer.

### `lib/file-system/transfer.ts` (headless — no DOM/React)
Split by nature: **pure, stateless transforms stay module functions**; the
**fs-orchestrating operations are a `FileTransfer` service class** with the `fs`
collaborator injected via its constructor. The accepted-type policy is **injected**
(`resolveType`) so the lib does not depend on the app's `FileTypes`. A structural FS
interface (`TransferFs`, a subset of `FileSystem`) keeps the service unit-testable with a
fake; the real `FileSystem` satisfies it. Re-exported from `lib/file-system/index.ts`.

```ts
export interface TransferFs {
  listFolderContents(folderId?: string): {
    folders: { id: string; metadata: FolderMetadata }[];
    files: { id: string; metadata: FileMetadata }[];
  };
  loadFile<T>(fileId: string): Promise<{ content: T; metadata: FileMetadata }>;
  getFolder(folderId: string): FolderMetadata;
  createFolder(parentPath: string, name: string): Promise<string>;
  addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>;
}

export interface TransferEntry { path: string; content: string } // relative, "/"-joined
export interface ImportResult { imported: number; skipped: number }
export type ResolveType = (fileName: string) => string | null;   // null => reject/skip

// Pure, stateless, dependency-free → functions (used internally by the service):
export function buildZip(entries: TransferEntry[]): Uint8Array;   // fflate.zipSync + TextEncoder
export function parseZip(bytes: Uint8Array): TransferEntry[];     // fflate.unzipSync + TextDecoder; skips dir entries
export function dirsForEntries(paths: string[]): string[];        // intermediate dirs, deduped, parent-first, no root

// Orchestration over the injected fs collaborator → service class:
export class FileTransfer {
  constructor(fs: TransferFs);
  collectFolderEntries(folderId: string): Promise<TransferEntry[]>;      // paths relative to folderId
  exportFolderZip(folderId: string): Promise<Uint8Array>;                // = buildZip(collectFolderEntries)
  importEntries(targetFolderId: string, entries: TransferEntry[], resolveType: ResolveType): Promise<ImportResult>;
  importZip(targetFolderId: string, bytes: Uint8Array, resolveType: ResolveType): Promise<ImportResult>; // = importEntries(parseZip)
}
```

`importEntries` filters entries to `resolveType(name) !== null`, creates the needed
subfolders (via `dirsForEntries`, resolving each dir path to a folder id and reusing an
existing subfolder of that name), then `addFile`s each surviving file with the resolved
type + a name made unique within its folder; returns `{ imported, skipped }`.

### `FileSystem` — expose the service via injection
`FileSystem` (singleton, private constructor) composes the service internally and exposes
it as a memoized accessor, so the UI never constructs it:

```ts
get transfer(): FileTransfer { return (this._transfer ??= new FileTransfer(this)); }
```

The UI calls `fs.transfer.exportFolderZip(id)`, `fs.transfer.importZip(targetId, bytes, acceptedFileType)`, etc.

### `features/project/filetype-icons.tsx` (UI type policy — extend)
Add **`acceptedFileType(name): FileTypes | null`** — `.smart.c`→SmartC,
`.scenario.json`→Scenario, `.asm`→ASM, else `null`. Passed as `resolveType` into
`importEntries`. *(pure, unit-tested)*

### `src/lib/download.ts` (DOM)
**`downloadBlob(filename: string, blob: Blob)`** — object URL + a temporary `<a download>`
click + `revoke()`. Text callers wrap their string themselves
(`new Blob([text], { type: "text/plain;charset=utf-8" })`).

## 5. UI wiring

- **`FileSidebarItem`** menu: **Download** → `fs.loadFile(id)` →
  `downloadBlob(file.name, new Blob([content]))`.
- **`FolderNode`** menu adds:
  - **Download (zip)** → `fs.transfer.exportFolderZip(folderId)` → `downloadBlob("<folder>.zip", blob)`.
  - **Upload File(s)…** → hidden `<input type="file" multiple accept=".smart.c,.scenario.json,.asm">`
    → build entries from the picked files → `fs.transfer.importEntries(folderId, entries, acceptedFileType)`.
  - **Import ZIP…** → hidden `<input type="file" accept=".zip">` →
    `fs.transfer.importZip(folderId, bytes, acceptedFileType)`.
  - **Import Folder…** → hidden `<input type="file" webkitdirectory>` → build entries from
    each file's `webkitRelativePath` → `fs.transfer.importEntries(folderId, entries, acceptedFileType)`
    (the picked directory becomes a subfolder, since its name is part of `webkitRelativePath`).
  - Each import toasts the returned `ImportResult` (`imported` / `skipped`).
- **`LeftSidebar`** header: an **Import** button (icon) beside the New-Project `+` → hidden
  `<input type="file" accept=".zip">` → `createFolder("/", uniqueName(<zip base name>, root folder names))`
  → `fs.transfer.importZip(newFolderId, bytes, acceptedFileType)`.
- **Editor page headers** — each editor (SmartC `smartc-editor.tsx`, ASM
  `asm-code-editor.tsx`, Scenario `scenario-editor.tsx`) registers a **Download** action via
  `usePageHeaderActions().addAction({ id: "download", label: "Download", icon: <DownloadIcon/>, onClick })`
  (removed on unmount). `onClick` downloads the **current editor buffer** (not the last
  saved copy) via `downloadBlob(file.metadata.name, new Blob([buffer]))`. To keep the closure fresh
  without re-registering, the live buffer is held in a ref that `onClick` reads. SmartC
  already uses `usePageHeaderActions`; ASM + Scenario start using it for this action.

All import paths pass `acceptedFileType` (from `filetype-icons.tsx`) as the `resolveType`
argument; downloads use `lib/download`. The sidebar and editors are thin callers of the
headless `fs.transfer` (`FileTransfer`) service.

Round-trip: *Download (zip)* of `FolderA` yields `FolderA.zip` whose entries are relative
to A; *top-level Import* of that zip recreates a project `FolderA` with the same contents;
*Import ZIP* into an existing folder drops A's contents directly into it.

## 6. Error handling

- Empty/`null`-typed entries are skipped (counted as `skipped`), never fail the import.
- Name collisions are resolved with `uniqueName` (never overwrite).
- `fflate`/read errors surface via `toast.error`; a partial import keeps whatever
  succeeded.
- Hidden inputs reset `value = ""` after use so re-selecting the same file re-triggers.

## 7. Testing

- **`lib/file-system/transfer.test.ts` (bun:test):**
  - `buildZip` → `parseZip` round-trip preserves paths + text content.
  - `dirsForEntries` — nested paths → correct deduped, parent-first directory list;
    root-level files → `[]`.
  - `new FileTransfer(fakeFs)` against an in-memory **fake `TransferFs`** (with a test
    `resolveType`): `importEntries`/`importZip` filter rejected entries, create nested
    folders once, dedupe names, and return the right `{imported, skipped}`;
    `collectFolderEntries`/`exportFolderZip` return relative paths that round-trip back
    through `importZip`.
- **`features/project/filetype-icons.test.ts` (bun:test):** `acceptedFileType` — the three
  accepted extensions map correctly; several rejected ones (`.md`, `.png`, no extension) →
  `null`.
- **DOM download, hidden-input uploads, `webkitdirectory` picker, editor-header Download:**
  `bun run build` + manual (download a file from the sidebar **and** from each editor's
  header — reflecting unsaved edits; download a folder zip; upload files; import a zip;
  import a directory; top-level import → new project; confirm unsupported files are skipped
  + reported).

## 8. Out of scope (deferred)

- Binary file content (structure allows it later).
- Overwrite-on-conflict prompts (we dedupe instead).
- Progress UI for large archives.
- Moving folders / exporting the entire workspace at once.
