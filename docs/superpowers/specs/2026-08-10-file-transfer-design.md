# File Transfer (Download / Upload / Import) — Design

**Date:** 2026-08-10
**Status:** Approved (design), pending implementation plan
**Context:** Follows the project-explorer work (commits `ff19f7e`..`f921b58`). Adds
download + upload/import, per file and per folder, to the sidebar.

---

## 1. Goal

- **Download** a single file (its text content) and a whole folder (a ZIP of the
  subtree).
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

Add **`fflate`** (`^0.8.2`, tiny zero-dependency zip) to `apps/studio` for ZIP build/parse.
Added by editing `apps/studio/package.json` + `bun install` (do **not** `bun update`; see
`[[bun-monorepo-dep-updates]]`).

## 4. Modules

### `features/project/file-transfer.ts`
A small structural FS interface keeps the fs-touching functions unit-testable with a fake:

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

export interface TransferEntry { path: string; content: string } // path is relative, "/"-joined
export interface ImportResult { imported: number; skipped: number }
```

Functions:
- **`acceptedFileType(name): FileTypes | null`** — `.smart.c`→SmartC, `.scenario.json`→
  Scenario, `.asm`→ASM, else `null`. *(pure)*
- **`buildZip(entries: TransferEntry[]): Uint8Array`** — `fflate.zipSync`, encoding each
  `content` with `TextEncoder`. *(pure)*
- **`parseZip(bytes: Uint8Array): TransferEntry[]`** — `fflate.unzipSync` + `TextDecoder`;
  skips directory entries (names ending `/`). *(pure)*
- **`dirsForEntries(paths: string[]): string[]`** — the set of intermediate directory
  paths implied by the file paths, deduped and sorted shallow→deep (so parents are
  created first); excludes the root. *(pure)*
- **`collectFolderEntries(fs, folderId): Promise<TransferEntry[]>`** — recurse
  `listFolderContents` + `loadFile`; paths are **relative to `folderId`** (the folder's
  own name is not included).
- **`importEntries(fs, targetFolderId, entries): Promise<ImportResult>`** — filter to
  `acceptedFileType !== null`; create the needed subfolders (via `dirsForEntries`, mapping
  each dir path to its parent's id, deduping existing folders by name); `addFile` each file
  with the inferred type and a name made unique within its folder; returns counts.

### `features/project/download.ts` (DOM)
- **`downloadText(filename, text)`** / **`downloadBlob(filename, blob)`** — object URL +
  a temporary `<a download>` click + revoke.

## 5. UI wiring

- **`FileSidebarItem`** menu: **Download** → `loadFile` → `downloadText(file.name, content)`.
- **`FolderNode`** menu adds:
  - **Download (zip)** → `collectFolderEntries` → `buildZip` → `downloadBlob("<folder>.zip", …)`.
  - **Upload File(s)…** → hidden `<input type="file" multiple accept=".smart.c,.scenario.json,.asm">`
    → for each file, `acceptedFileType` (skip nulls) → `addFile(folder, uniqueName, type, text)`.
  - **Import ZIP…** → hidden `<input type="file" accept=".zip">` → `parseZip` →
    `importEntries(folder, entries)`.
  - **Import Folder…** → hidden `<input type="file" webkitdirectory>` → build entries from
    each file's `webkitRelativePath` → `importEntries(folder, entries)` (the picked
    directory becomes a subfolder, since its name is part of `webkitRelativePath`).
  - Each import toasts the `ImportResult` (`imported` / `skipped`).
- **`LeftSidebar`** header: an **Import** button (icon) beside the New-Project `+` → hidden
  `<input type="file" accept=".zip">` → `createFolder("/", uniqueName(<zip base name>, root folder names))`
  → `importEntries(newFolderId, parseZip(bytes))`.

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

- **`file-transfer.test.ts` (bun:test):**
  - `acceptedFileType` — the three accepted extensions + several rejected ones → `null`.
  - `buildZip` → `parseZip` round-trip preserves paths + text content.
  - `dirsForEntries` — nested paths → correct deduped, parent-first directory list;
    root-level files → `[]`.
  - `importEntries` / `collectFolderEntries` against an in-memory **fake `TransferFs`**:
    import filters rejected entries, creates nested folders once, dedupes names, and
    returns the right `{imported, skipped}`; collect returns relative paths that round-trip
    through `buildZip`/`importEntries`.
- **DOM download, hidden-input uploads, `webkitdirectory` picker:** `bun run build` +
  manual (download a file + a folder zip; upload files; import a zip; import a directory;
  top-level import → new project; confirm unsupported files are skipped + reported).

## 8. Out of scope (deferred)

- Binary file content (structure allows it later).
- Overwrite-on-conflict prompts (we dedupe instead).
- Progress UI for large archives.
- Moving folders / exporting the entire workspace at once.
