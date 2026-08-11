# File Transfer (Download / Upload / Import) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add download (per file / per folder) and upload/import (files, ZIP, native directory) to the Studio, with a headless transfer core inside `lib/file-system` and thin DOM/UI callers in the sidebar and editors.

**Architecture:** Pure, stateless transforms (`buildZip`/`parseZip`/`dirsForEntries`) and an fs-orchestrating `FileTransfer` service class live in `apps/studio/src/lib/file-system/transfer.ts` (100% DOM/React-free). `FileTransfer` takes a structural `TransferFs` collaborator (a subset of `FileSystem`) via its constructor; `FileSystem` exposes it as a memoized `fs.transfer` accessor. The accepted-type policy is injected as a `resolveType` callback so the lib never imports the app's `FileTypes`. The single DOM boundary is `src/lib/download.ts` (`downloadBlob`). The sidebar (`FileSidebarItem`, `FolderNode`, `LeftSidebar`) and the three editors (`SmartCEditor`, `AsmCodeEditor`, `ScenarioEditor`) are thin callers.

**Tech Stack:** Bun + React 19 + TypeScript, `@monaco-editor/react`, jotai (`usePageHeaderActions`), `sonner` toasts, `fflate` (new — ZIP), `bun:test`.

**Spec:** `docs/superpowers/specs/2026-08-10-file-transfer-design.md`

**Conventions:**
- Work on the `development` branch (never `main`). Commit messages end with:
  `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`
- Each commit stages only the feature's files (the working tree has unrelated WIP).
- Test runner: from `apps/studio`, `bun test <path>` (there is no `test` npm script; the root `package.json` has `"test": "bun test"`).
- Build check: from `apps/studio`, `bun run build` (transpile-only; ends with `✅ Build completed`).
- `noUnusedLocals` is `false`, so transitional unused imports are tolerated between tasks.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `apps/studio/package.json` | add `fflate` dependency |
| `apps/studio/src/lib/file-system/transfer.ts` | **new** — headless transfer core: types, pure transforms, `FileTransfer` service |
| `apps/studio/src/lib/file-system/transfer.test.ts` | **new** — bun:test for pure transforms + `FileTransfer` (fake fs) |
| `apps/studio/src/lib/file-system/file-system.ts` | add memoized `get transfer()` accessor |
| `apps/studio/src/lib/file-system/index.ts` | re-export `./transfer` |
| `apps/studio/src/features/project/filetype-icons.tsx` | add `acceptedFileType(name)` policy |
| `apps/studio/src/features/project/filetype-icons.test.ts` | **new** — bun:test for `acceptedFileType` |
| `apps/studio/src/lib/download.ts` | **new** — DOM `downloadBlob(filename, blob)` |
| `apps/studio/src/features/project/file-sidebar-item.tsx` | per-file **Download** menu item |
| `apps/studio/src/features/project/folder-node.tsx` | folder **Download (zip)** / **Upload File(s)** / **Import ZIP** / **Import Folder** |
| `apps/studio/src/components/ui/layout/left-sidebar.tsx` | top-level **Import** (new root project from ZIP) |
| `apps/studio/src/features/smartc-editor/smartc-editor.tsx` | header **Download** action |
| `apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx` | header **Download** action |
| `apps/studio/src/features/simulator/scenario/scenario-editor.tsx` | header **Download** action |

---

## Task 1: Add the `fflate` dependency

**Files:**
- Modify: `apps/studio/package.json`

- [ ] **Step 1: Add fflate to the studio workspace**

Run (from `apps/studio`):

```bash
bun add fflate@^0.8.3
```

Expected: `apps/studio/package.json` gains `"fflate": "^0.8.3"` under `dependencies`; the root `bun.lock` updates. (This is `bun add` inside the workspace — NOT `bun update <names>` at the repo root; see `bun-monorepo-dep-updates`.)

- [ ] **Step 2: Verify fflate resolves and works under bun**

Run (from `apps/studio`):

```bash
bun -e "import {zipSync,unzipSync} from 'fflate'; const z=zipSync({'a.txt':new TextEncoder().encode('hi')}); console.log(new TextDecoder().decode(unzipSync(z)['a.txt']));"
```

Expected: prints `hi`.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/package.json ../../bun.lock
git commit -m "chore(studio): add fflate for ZIP build/parse

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

> Note: if `git add ../../bun.lock` errors because of path context, stage it from the repo root instead: `git -C ../.. add bun.lock`.

---

## Task 2: Pure transfer transforms + types (`transfer.ts`)

**Files:**
- Create: `apps/studio/src/lib/file-system/transfer.ts`
- Test: `apps/studio/src/lib/file-system/transfer.test.ts`

- [ ] **Step 1: Write the failing tests for the pure functions**

Create `apps/studio/src/lib/file-system/transfer.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { buildZip, parseZip, dirsForEntries, decodeTextOrNull, type TransferEntry } from "./transfer";

const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);

describe("buildZip / parseZip", () => {
  it("round-trips paths and UTF-8 text content", () => {
    const entries: TransferEntry[] = [
      { path: "a.txt", content: "hello" },
      { path: "d/b.txt", content: "héllo € — ✓" },
    ];
    const back = parseZip(buildZip(entries));
    expect([...back].sort(byPath)).toEqual([...entries].sort(byPath));
  });

  it("skips directory entries when parsing", () => {
    // A single nested file produces no standalone dir entry from our builder,
    // but parseZip must still ignore any path ending in "/".
    const back = parseZip(buildZip([{ path: "x/y.txt", content: "z" }]));
    expect(back.every((e) => !e.path.endsWith("/"))).toBe(true);
    expect(back).toEqual([{ path: "x/y.txt", content: "z" }]);
  });
});

describe("dirsForEntries", () => {
  it("returns intermediate dirs, deduped, parent-first, no root", () => {
    expect(dirsForEntries(["a/b/c.txt", "a/d.txt", "e.txt"])).toEqual(["a", "a/b"]);
  });

  it("returns [] for root-level files only", () => {
    expect(dirsForEntries(["x.txt", "y.txt"])).toEqual([]);
  });
});

describe("decodeTextOrNull", () => {
  it("decodes valid UTF-8 to a string", () => {
    const bytes = new TextEncoder().encode("héllo € ✓");
    expect(decodeTextOrNull(bytes)).toBe("héllo € ✓");
  });

  it("returns null for content with a NUL byte", () => {
    expect(decodeTextOrNull(new Uint8Array([104, 105, 0, 33]))).toBeNull();
  });

  it("returns null for invalid UTF-8 (binary)", () => {
    // Lone 0xFF/0xFE are invalid UTF-8 start bytes.
    expect(decodeTextOrNull(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/studio`):

```bash
bun test src/lib/file-system/transfer.test.ts
```

Expected: FAIL — cannot resolve `./transfer` / exports not defined.

- [ ] **Step 3: Create `transfer.ts` with types + pure functions**

Create `apps/studio/src/lib/file-system/transfer.ts`:

```ts
import { zipSync, unzipSync } from "fflate";
import type { FileMetadata, FolderMetadata } from "./file-system-types.ts";

/** An exported file entry with a relative, "/"-joined path (content is real text). */
export interface TransferEntry {
  path: string;
  content: string;
}

/** An entry read from an external source; `content` is null if it wasn't decodable text. */
export interface ImportEntry {
  path: string;
  content: string | null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

/** Maps a file name to a target type, or null to reject/skip it. */
export type ResolveType = (fileName: string) => string | null;

/**
 * Structural subset of `FileSystem` the transfer service needs. Keeps the
 * service unit-testable with a fake; the real `FileSystem` satisfies it.
 */
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

// --- Pure, stateless, dependency-light transforms -------------------------

/** Build a ZIP archive from text entries (UTF-8 encoded). */
export function buildZip(entries: TransferEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const zippable: Record<string, Uint8Array> = {};
  for (const e of entries) zippable[e.path] = enc.encode(e.content);
  return zipSync(zippable);
}

/**
 * Decode bytes as strict UTF-8 text, or return null if they look binary
 * (contain a NUL byte, or aren't valid UTF-8). The byte→text boundary shared
 * by ZIP parsing and the UI file pickers.
 */
export function decodeTextOrNull(bytes: Uint8Array): string | null {
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Parse a ZIP archive into import entries (binary → content null), skipping dirs. */
export function parseZip(bytes: Uint8Array): ImportEntry[] {
  const unzipped = unzipSync(bytes);
  const entries: ImportEntry[] = [];
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("/")) continue; // directory entry
    entries.push({ path, content: decodeTextOrNull(data) });
  }
  return entries;
}

/**
 * The intermediate directories needed for the given file paths: deduped,
 * parent-first (shallow → deep), root excluded.
 */
export function dirsForEntries(paths: string[]): string[] {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    parts.pop(); // drop the file name
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      dirs.add(acc);
    }
  }
  return [...dirs].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/studio`):

```bash
bun test src/lib/file-system/transfer.test.ts
```

Expected: PASS (round-trip, dir list, decodeTextOrNull).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/lib/file-system/transfer.ts apps/studio/src/lib/file-system/transfer.test.ts
git commit -m "feat(studio): pure ZIP transforms + transfer types (headless)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `acceptedFileType` policy

**Files:**
- Modify: `apps/studio/src/features/project/filetype-icons.tsx`
- Test: `apps/studio/src/features/project/filetype-icons.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/studio/src/features/project/filetype-icons.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { acceptedFileType, FileTypes } from "./filetype-icons";

describe("acceptedFileType", () => {
  it("maps the three accepted extensions", () => {
    expect(acceptedFileType("main.smart.c")).toBe(FileTypes.SmartC);
    expect(acceptedFileType("run.scenario.json")).toBe(FileTypes.Scenario);
    expect(acceptedFileType("code.asm")).toBe(FileTypes.ASM);
  });

  it("is case-insensitive on the extension", () => {
    expect(acceptedFileType("MAIN.SMART.C")).toBe(FileTypes.SmartC);
  });

  it("rejects everything else", () => {
    expect(acceptedFileType("README.md")).toBeNull();
    expect(acceptedFileType("logo.png")).toBeNull();
    expect(acceptedFileType("data.json")).toBeNull();
    expect(acceptedFileType("Makefile")).toBeNull();
    expect(acceptedFileType("")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/studio`):

```bash
bun test src/features/project/filetype-icons.test.ts
```

Expected: FAIL — `acceptedFileType` is not exported.

- [ ] **Step 3: Add `acceptedFileType` to `filetype-icons.tsx`**

Append to `apps/studio/src/features/project/filetype-icons.tsx` (after `getFileTypeIcon`):

```ts
/**
 * Maps an incoming file name to the UI-supported type, or `null` to reject it.
 * Used as the `resolveType` policy for uploads/imports. Only SmartC
 * (`.smart.c`), Scenario (`.scenario.json`) and ASM (`.asm`) are accepted.
 */
export function acceptedFileType(name: string): FileTypes | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".smart.c")) return FileTypes.SmartC;
  if (lower.endsWith(".scenario.json")) return FileTypes.Scenario;
  if (lower.endsWith(".asm")) return FileTypes.ASM;
  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/studio`):

```bash
bun test src/features/project/filetype-icons.test.ts
```

Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project/filetype-icons.tsx apps/studio/src/features/project/filetype-icons.test.ts
git commit -m "feat(studio): acceptedFileType import/upload policy

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: `FileTransfer` service class

**Files:**
- Modify: `apps/studio/src/lib/file-system/transfer.ts`
- Test: `apps/studio/src/lib/file-system/transfer.test.ts`

- [ ] **Step 1: Write the failing tests for `FileTransfer` (fake fs)**

Append to `apps/studio/src/lib/file-system/transfer.test.ts`:

```ts
import { FileTransfer, type TransferFs, type ResolveType } from "./transfer";
import type { FileMetadata, FolderMetadata } from "./file-system-types.ts";

/** In-memory TransferFs that mirrors the real path semantics. */
class FakeFs implements TransferFs {
  private folders = new Map<string, FolderMetadata>();
  private files = new Map<string, FileMetadata & { content: string }>();
  private contents = new Map<string, { folders: string[]; files: string[] }>();
  private seq = 0;

  constructor() {
    this.folders.set("root", {
      id: "root",
      name: "@@Root",
      path: "/",
      createdAt: 0,
      lastModified: 0,
    });
    this.contents.set("root", { folders: [], files: [] });
  }

  listFolderContents(folderId = "root") {
    const c = this.contents.get(folderId)!;
    return {
      folders: c.folders.map((id) => ({ id, metadata: this.folders.get(id)! })),
      files: c.files.map((id) => ({ id, metadata: this.files.get(id)! })),
    };
  }

  async loadFile<T>(fileId: string) {
    const f = this.files.get(fileId)!;
    return { content: f.content as unknown as T, metadata: f as FileMetadata };
  }

  getFolder(folderId: string) {
    return this.folders.get(folderId)!;
  }

  async createFolder(parentPath: string, name: string) {
    const parent =
      [...this.folders.values()].find((f) => f.path === parentPath) ??
      this.folders.get("root")!;
    const id = `f${++this.seq}`;
    const path = `${parent.path === "/" ? "" : parent.path}/${name}`;
    this.folders.set(id, { id, name, path, createdAt: 0, lastModified: 0 });
    this.contents.set(id, { folders: [], files: [] });
    this.contents.get(parent.id)!.folders.push(id);
    return id;
  }

  async addFile<T>(folderId: string, name: string, type: string, content: T) {
    const folder = this.folders.get(folderId)!;
    const id = `file${++this.seq}`;
    const path = `${folder.path === "/" ? "" : folder.path}/${name}`;
    this.files.set(id, {
      id,
      folderId,
      name,
      type,
      path,
      lastModified: 0,
      content: String(content),
    });
    this.contents.get(folderId)!.files.push(id);
    return id;
  }
}

const testResolve: ResolveType = (name) =>
  name.endsWith(".smart.c")
    ? "smartc"
    : name.endsWith(".scenario.json")
      ? "scenario"
      : name.endsWith(".asm")
        ? "asm"
        : null;

describe("FileTransfer.importEntries", () => {
  it("filters rejected entries, nests folders, and counts results", async () => {
    const fs = new FakeFs();
    const target = await fs.createFolder("/", "proj");
    const t = new FileTransfer(fs);

    const res = await t.importEntries(
      target,
      [
        { path: "a.smart.c", content: "long x;" },
        { path: "sub/b.scenario.json", content: "{}" },
        { path: "sub/readme.md", content: "nope" }, // skipped: wrong extension
        { path: "bin.asm", content: null }, // skipped: binary (undecodable)
        { path: "c.asm", content: "^declare r0" },
      ],
      testResolve,
    );

    expect(res).toEqual({ imported: 3, skipped: 2 });

    const top = fs.listFolderContents(target);
    expect(top.files.map((f) => f.metadata.name).sort()).toEqual([
      "a.smart.c",
      "c.asm",
    ]);
    const sub = top.folders.find((f) => f.metadata.name === "sub")!;
    expect(sub).toBeDefined();
    const subContents = fs.listFolderContents(sub.id);
    expect(subContents.files.map((f) => f.metadata.name)).toEqual([
      "b.scenario.json",
    ]);
  });

  it("dedupes names within a folder (never overwrites)", async () => {
    const fs = new FakeFs();
    const target = await fs.createFolder("/", "proj");
    const t = new FileTransfer(fs);

    await t.importEntries(target, [{ path: "a.smart.c", content: "1" }], testResolve);
    await t.importEntries(target, [{ path: "a.smart.c", content: "2" }], testResolve);

    const names = fs.listFolderContents(target).files.map((f) => f.metadata.name);
    expect(names.sort()).toEqual(["a-2.smart.c", "a.smart.c"]);
  });

  it("reuses an existing subfolder of the same name", async () => {
    const fs = new FakeFs();
    const target = await fs.createFolder("/", "proj");
    const t = new FileTransfer(fs);

    await t.importEntries(
      target,
      [
        { path: "sub/a.smart.c", content: "1" },
        { path: "sub/b.asm", content: "2" },
      ],
      testResolve,
    );

    const subs = fs.listFolderContents(target).folders.filter((f) => f.metadata.name === "sub");
    expect(subs.length).toBe(1);
    expect(fs.listFolderContents(subs[0].id).files.length).toBe(2);
  });
});

describe("FileTransfer collect/export round-trip", () => {
  it("collectFolderEntries → buildZip → importZip restores the subtree", async () => {
    const fs = new FakeFs();
    const proj = await fs.createFolder("/", "proj");
    await fs.addFile(proj, "main.smart.c", "smartc", "long a;");
    const scen = await fs.createFolder("/proj", "scenarios");
    await fs.addFile(scen, "s1.scenario.json", "scenario", '{"v":2}');
    const t = new FileTransfer(fs);

    const entries = await t.collectFolderEntries(proj);
    expect(entries.map((e) => e.path).sort()).toEqual([
      "main.smart.c",
      "scenarios/s1.scenario.json",
    ]);

    const zip = await t.exportFolderZip(proj);
    const target = await fs.createFolder("/", "restored");
    const res = await t.importZip(target, zip, testResolve);

    expect(res.imported).toBe(2);
    const top = fs.listFolderContents(target);
    expect(top.files.map((f) => f.metadata.name)).toEqual(["main.smart.c"]);
    const sub = top.folders.find((f) => f.metadata.name === "scenarios")!;
    expect(fs.listFolderContents(sub.id).files.map((f) => f.metadata.name)).toEqual([
      "s1.scenario.json",
    ]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run (from `apps/studio`):

```bash
bun test src/lib/file-system/transfer.test.ts
```

Expected: FAIL — `FileTransfer` is not exported.

- [ ] **Step 3: Implement `FileTransfer` + internal name helpers in `transfer.ts`**

Append to `apps/studio/src/lib/file-system/transfer.ts`:

```ts
// --- Internal path/name helpers (kept local so the lib stays decoupled) ----

function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Return a name not present in `existing`, inserting -2, -3, … before the
 * (possibly compound, e.g. `.smart.c`) extension. Splits on the first dot.
 */
function uniqueNameIn(name: string, existing: Iterable<string>): string {
  const set = new Set(existing);
  if (!set.has(name)) return name;
  const dot = name.indexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let candidate = name;
  for (let n = 2; set.has(candidate); n++) candidate = `${stem}-${n}${ext}`;
  return candidate;
}

// --- Orchestration over the injected fs collaborator ----------------------

export class FileTransfer {
  constructor(private readonly fs: TransferFs) {}

  /** Collect every file under `folderId` as entries with paths relative to it. */
  async collectFolderEntries(folderId: string): Promise<TransferEntry[]> {
    const entries: TransferEntry[] = [];
    const walk = async (id: string, prefix: string): Promise<void> => {
      const { folders, files } = this.fs.listFolderContents(id);
      for (const f of files) {
        const { content } = await this.fs.loadFile<unknown>(f.id);
        entries.push({
          path: prefix ? `${prefix}/${f.metadata.name}` : f.metadata.name,
          content: typeof content === "string" ? content : String(content ?? ""),
        });
      }
      for (const sub of folders) {
        await walk(
          sub.id,
          prefix ? `${prefix}/${sub.metadata.name}` : sub.metadata.name,
        );
      }
    };
    await walk(folderId, "");
    return entries;
  }

  /** ZIP of the whole subtree under `folderId`. */
  async exportFolderZip(folderId: string): Promise<Uint8Array> {
    return buildZip(await this.collectFolderEntries(folderId));
  }

  /**
   * Import `entries` into `targetFolderId`: entries rejected by either gate —
   * binary (content === null) or wrong extension (resolveType → null) — are
   * skipped, needed subfolders are created (reusing existing ones by name), and
   * each surviving file is added with a name unique in its folder.
   */
  async importEntries(
    targetFolderId: string,
    entries: ImportEntry[],
    resolveType: ResolveType,
  ): Promise<ImportResult> {
    // Two gates: real text (content !== null) AND accepted extension.
    const accepted = entries.filter(
      (e) => e.content !== null && resolveType(baseName(e.path)) !== null,
    ) as { path: string; content: string }[];
    const skipped = entries.length - accepted.length;

    // Resolve every needed directory path to a folder id (parent-first).
    const dirIds = new Map<string, string>([["", targetFolderId]]);
    for (const dir of dirsForEntries(accepted.map((e) => e.path))) {
      const parent = parentDir(dir);
      const name = baseName(dir);
      const parentId = dirIds.get(parent)!;
      const existing = this.fs
        .listFolderContents(parentId)
        .folders.find((f) => f.metadata.name === name);
      const id = existing
        ? existing.id
        : await this.fs.createFolder(this.fs.getFolder(parentId).path, name);
      dirIds.set(dir, id);
    }

    let imported = 0;
    for (const e of accepted) {
      const name = baseName(e.path);
      const type = resolveType(name)!;
      const folderId = dirIds.get(parentDir(e.path))!;
      const existingNames = this.fs
        .listFolderContents(folderId)
        .files.map((f) => f.metadata.name);
      await this.fs.addFile(folderId, uniqueNameIn(name, existingNames), type, e.content);
      imported++;
    }

    return { imported, skipped };
  }

  /** Import a ZIP archive into `targetFolderId`. */
  async importZip(
    targetFolderId: string,
    bytes: Uint8Array,
    resolveType: ResolveType,
  ): Promise<ImportResult> {
    return this.importEntries(targetFolderId, parseZip(bytes), resolveType);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run (from `apps/studio`):

```bash
bun test src/lib/file-system/transfer.test.ts
```

Expected: PASS (all pure + FileTransfer tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/lib/file-system/transfer.ts apps/studio/src/lib/file-system/transfer.test.ts
git commit -m "feat(studio): FileTransfer service (export/import over injected fs)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Expose `fs.transfer` + re-export from index

**Files:**
- Modify: `apps/studio/src/lib/file-system/file-system.ts`
- Modify: `apps/studio/src/lib/file-system/index.ts`

- [ ] **Step 1: Import `FileTransfer` and add the memoized accessor**

In `apps/studio/src/lib/file-system/file-system.ts`, add the import near the other type imports at the top:

```ts
import { FileTransfer } from "./transfer.ts";
```

Then, inside the `FileSystem` class, add the backing field next to the existing private fields (after `private readonly metadata: FileSystemMetadata;`):

```ts
  private _transfer?: FileTransfer;
```

And add the accessor just before the final closing brace of the class (after the `getFolder(...)` method):

```ts
  /**
   * Headless download/upload/import service, composed lazily. The real
   * `FileSystem` satisfies the service's structural `TransferFs` interface.
   */
  get transfer(): FileTransfer {
    return (this._transfer ??= new FileTransfer(this));
  }
```

- [ ] **Step 2: Re-export the transfer module**

In `apps/studio/src/lib/file-system/index.ts`, add a line:

```ts
export * from './transfer';
```

Resulting file:

```ts
export * from './file-system';
export * from './file-system-types.ts'
export * from './transfer';
```

- [ ] **Step 3: Verify the build (type wiring)**

Run (from `apps/studio`):

```bash
bun run build 2>&1 | tail -2
```

Expected: ends with `✅ Build completed`. (If `new FileTransfer(this)` reports a type error, it means `FileSystem` no longer structurally satisfies `TransferFs` — re-check the five method signatures against the interface.)

- [ ] **Step 4: Run the full transfer test again (sanity, imports resolve)**

Run (from `apps/studio`):

```bash
bun test src/lib/file-system/transfer.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/lib/file-system/file-system.ts apps/studio/src/lib/file-system/index.ts
git commit -m "feat(studio): expose fs.transfer accessor + re-export transfer

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: `downloadBlob` DOM helper

**Files:**
- Create: `apps/studio/src/lib/download.ts`

- [ ] **Step 1: Create `download.ts`**

Create `apps/studio/src/lib/download.ts`:

```ts
/**
 * Trigger a browser download of `blob` under `filename`. The single DOM
 * boundary for the (headless) file-transfer core. Text callers wrap their
 * string themselves: `new Blob([text], { type: "text/plain;charset=utf-8" })`.
 */
export function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2: Verify the build**

Run (from `apps/studio`):

```bash
bun run build 2>&1 | tail -2
```

Expected: ends with `✅ Build completed`. (No unit test — pure DOM side-effect, verified manually in Task 11.)

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/lib/download.ts
git commit -m "feat(studio): downloadBlob DOM helper

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: Per-file **Download** in the sidebar

**Files:**
- Modify: `apps/studio/src/features/project/file-sidebar-item.tsx`

- [ ] **Step 1: Add imports**

In `apps/studio/src/features/project/file-sidebar-item.tsx`, replace the `lucide-react` import (line 13) and add the download import:

```ts
import { MoreVerticalIcon, DownloadIcon } from "lucide-react";
import { downloadBlob } from "@/lib/download.ts";
```

- [ ] **Step 2: Add the download handler**

Inside `FileSidebarItem`, after the `siblingNames` declaration (around line 43), add:

```ts
  const onDownload = async () => {
    try {
      const loaded = await fs.loadFile<unknown>(file.id);
      const text =
        typeof loaded.content === "string"
          ? loaded.content
          : String(loaded.content ?? "");
      downloadBlob(file.name, new Blob([text], { type: "text/plain;charset=utf-8" }));
    } catch (e: any) {
      toast.error(e.message);
    }
  };
```

- [ ] **Step 3: Add the Download menu item**

In the `DropdownMenuContent` (before the Rename item), add:

```tsx
            <DropdownMenuItem onClick={onDownload}>
              <DownloadIcon className="h-4 w-4" />
              Download
            </DropdownMenuItem>
```

- [ ] **Step 4: Verify the build**

Run (from `apps/studio`):

```bash
bun run build 2>&1 | tail -2
```

Expected: ends with `✅ Build completed`.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/project/file-sidebar-item.tsx
git commit -m "feat(studio): download a single file from the sidebar

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: Folder **Download (zip)** / **Upload** / **Import** in the sidebar

**Files:**
- Modify: `apps/studio/src/features/project/folder-node.tsx`

- [ ] **Step 1: Add imports**

In `apps/studio/src/features/project/folder-node.tsx`:

- Change the `react` import to add `useRef`:

```ts
import { useRef, useState } from "react";
```

- Add icons to the `lucide-react` import block:

```ts
  DownloadIcon,
  UploadIcon,
  FileArchiveIcon,
  FolderInputIcon,
```

- Add new imports below the existing ones:

```ts
import { downloadBlob } from "@/lib/download.ts";
import { acceptedFileType } from "./filetype-icons";
import { decodeTextOrNull, type ImportEntry } from "@/lib/file-system";
```

- [ ] **Step 2: Add hidden-input refs + handlers**

Inside `FolderNode`, after the existing `useState` declarations (around line 44), add:

```ts
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const zipInputRef = useRef<HTMLInputElement>(null);
  const dirInputRef = useRef<HTMLInputElement>(null);

  const reportImport = (imported: number, skipped: number) => {
    toast.success(
      `Imported ${imported} file(s)` + (skipped ? ` (${skipped} skipped)` : ""),
    );
  };

  const filesToEntries = async (
    list: FileList,
    relative: boolean,
  ): Promise<ImportEntry[]> => {
    const entries: ImportEntry[] = [];
    for (const f of Array.from(list)) {
      const path = relative ? f.webkitRelativePath || f.name : f.name;
      const bytes = new Uint8Array(await f.arrayBuffer());
      entries.push({ path, content: decodeTextOrNull(bytes) });
    }
    return entries;
  };

  const onDownloadZip = async () => {
    try {
      const bytes = await fs.transfer.exportFolderZip(folder.id);
      // Copy into an ArrayBuffer-backed view so it's a valid BlobPart under TS 5.7.
      downloadBlob(
        `${folder.name}.zip`,
        new Blob([new Uint8Array(bytes)], { type: "application/zip" }),
      );
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const onUploadFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    try {
      if (list && list.length) {
        const entries = await filesToEntries(list, false);
        const res = await fs.transfer.importEntries(folder.id, entries, acceptedFileType);
        setExpanded(true);
        reportImport(res.imported, res.skipped);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const onImportZip = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const res = await fs.transfer.importZip(folder.id, bytes, acceptedFileType);
        setExpanded(true);
        reportImport(res.imported, res.skipped);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };

  const onImportFolder = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const list = e.target.files;
    try {
      if (list && list.length) {
        const entries = await filesToEntries(list, true);
        const res = await fs.transfer.importEntries(folder.id, entries, acceptedFileType);
        setExpanded(true);
        reportImport(res.imported, res.skipped);
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };
```

- [ ] **Step 3: Add menu items**

In the `DropdownMenuContent`, after the existing **New Folder** item and before **Rename**, add:

```tsx
              <DropdownMenuItem onClick={onDownloadZip}>
                <DownloadIcon className="h-4 w-4" />
                Download (zip)
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => uploadInputRef.current?.click()}>
                <UploadIcon className="h-4 w-4" />
                Upload File(s)…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => zipInputRef.current?.click()}>
                <FileArchiveIcon className="h-4 w-4" />
                Import ZIP…
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => dirInputRef.current?.click()}>
                <FolderInputIcon className="h-4 w-4" />
                Import Folder…
              </DropdownMenuItem>
```

- [ ] **Step 4: Add the hidden inputs**

Inside the top-level fragment, just before the `<NewFileDialog ... />` element, add:

```tsx
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept=".smart.c,.scenario.json,.asm"
        hidden
        onChange={onUploadFiles}
      />
      <input ref={zipInputRef} type="file" accept=".zip" hidden onChange={onImportZip} />
      <input
        ref={dirInputRef}
        type="file"
        hidden
        onChange={onImportFolder}
        {...({ webkitdirectory: "" } as any)}
      />
```

- [ ] **Step 5: Verify the build**

Run (from `apps/studio`):

```bash
bun run build 2>&1 | tail -2
```

Expected: ends with `✅ Build completed`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/project/folder-node.tsx
git commit -m "feat(studio): folder download-zip, upload, import zip/folder

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 9: Top-level **Import** (new root project from ZIP)

**Files:**
- Modify: `apps/studio/src/components/ui/layout/left-sidebar.tsx`

- [ ] **Step 1: Add imports**

In `apps/studio/src/components/ui/layout/left-sidebar.tsx`:

- Change the `react` import to add `useRef`:

```ts
import { useEffect, useRef, useState } from "react";
```

- Add `UploadIcon` to the `lucide-react` import.
- Add these new imports (do NOT import `downloadBlob` here — it is not used in this file):

```ts
import { acceptedFileType } from "@/features/project/filetype-icons";
import { uniqueName } from "@/features/project/file-naming";
import { toast } from "sonner";
```

- [ ] **Step 2: Add the hidden input ref + handler**

Inside `LeftSidebar`, after `const [isOpen, setIsOpen] = useState(false);` (line 75), add:

```ts
  const importInputRef = useRef<HTMLInputElement>(null);

  const onImportProject = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    try {
      if (file) {
        const rootNames = fs.listFolderContents().folders.map((f) => f.metadata.name);
        const base = file.name.replace(/\.zip$/i, "");
        const folderId = await fs.createFolder("/", uniqueName(base, rootNames));
        const bytes = new Uint8Array(await file.arrayBuffer());
        const res = await fs.transfer.importZip(folderId, bytes, acceptedFileType);
        toast.success(
          `Imported ${res.imported} file(s)` + (res.skipped ? ` (${res.skipped} skipped)` : ""),
        );
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      e.target.value = "";
    }
  };
```

- [ ] **Step 3: Add the Import button beside the New-Project `+`**

Replace the current right-hand side of the header (the `<Dialog open={isOpen} …> … </Dialog>` block at lines 83-95) with a flex group that holds both the `+` and the new Import button:

```tsx
              <div className="flex items-center gap-1">
                <Dialog open={isOpen} onOpenChange={setIsOpen}>
                  <DialogTrigger>
                    <Tooltip delayDuration={1000}>
                      <TooltipTrigger>
                        <PlusIcon className="h-6 w-6 p-1 rounded-sm hover:bg-black/5 cursor-pointer" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Add new project</p>
                      </TooltipContent>
                    </Tooltip>
                  </DialogTrigger>
                  <NewProjectDialog close={() => setIsOpen(false)} />
                </Dialog>
                <Tooltip delayDuration={1000}>
                  <TooltipTrigger asChild>
                    <UploadIcon
                      onClick={() => importInputRef.current?.click()}
                      className="h-6 w-6 p-1 rounded-sm hover:bg-black/5 cursor-pointer"
                    />
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Import project (zip)</p>
                  </TooltipContent>
                </Tooltip>
              </div>
```

- [ ] **Step 4: Add the hidden input**

Add the hidden input immediately after the opening `<SidebarGroupContent>` tag (line 98):

```tsx
            <input
              ref={importInputRef}
              type="file"
              accept=".zip"
              hidden
              onChange={onImportProject}
            />
```

- [ ] **Step 5: Verify the build**

Run (from `apps/studio`):

```bash
bun run build 2>&1 | tail -2
```

Expected: ends with `✅ Build completed`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/components/ui/layout/left-sidebar.tsx
git commit -m "feat(studio): top-level project import from zip

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 10: Editor header **Download** actions

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx`
- Modify: `apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx`
- Modify: `apps/studio/src/features/simulator/scenario/scenario-editor.tsx`

Each editor registers a `download` page-header action once and reads the **live buffer** from a ref (so unsaved edits are included without re-registering on every keystroke).

- [ ] **Step 1: SmartC editor — imports**

In `apps/studio/src/features/smartc-editor/smartc-editor.tsx`:

- Add `DownloadIcon` to the `lucide-react` import (line 3):

```ts
import { SaveIcon, FileWarning, Code2, Bug, FilePlus2, DownloadIcon } from "lucide-react";
```

- Add the download import:

```ts
import { downloadBlob } from "@/lib/download.ts";
```

- [ ] **Step 2: SmartC editor — add the action type + ref + effect**

- Extend the `ActionType` enum (lines 104-108):

```ts
enum ActionType {
  Compile = "compile",
  Debug = "debug",
  NewScenario = "new-scenario",
  Download = "download",
}
```

- Inside `SmartCEditor`, after `const [code, setCode] = useState(file.content as string);` (line 114), add a live-buffer ref kept fresh each render:

```ts
  const codeRef = useRef(code);
  codeRef.current = code;
```

- Add the registration effect next to the other `addAction` effects (e.g. after the Debug effect, around line 179):

```ts
  useEffect(() => {
    addAction({
      id: ActionType.Download,
      tooltip: "Download this file",
      label: "Download",
      icon: <DownloadIcon className="h-4 w-4" />,
      onClick: () =>
        downloadBlob(
          file.metadata.name,
          new Blob([codeRef.current], { type: "text/plain;charset=utf-8" }),
        ),
      variant: "default",
    });
    return () => removeAction(ActionType.Download);
  }, [addAction, removeAction, file.metadata.name]);
```

- [ ] **Step 3: ASM editor — imports + hook + ref + effect**

In `apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx`:

- Add imports:

```ts
import { FileWarning, SaveIcon, DownloadIcon } from "lucide-react";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { downloadBlob } from "@/lib/download.ts";
```

- Inside `AsmCodeEditor`, after `const fs = useFileSystem();` (line 31), add:

```ts
  const { addAction, removeAction } = usePageHeaderActions();
```

- After `const [code, setCode] = useState(file.content as string);` (line 32), add:

```ts
  const codeRef = useRef(code);
  codeRef.current = code;
```

- Add the registration effect after the height/keydown effect (around line 58):

```ts
  useEffect(() => {
    addAction({
      id: "download",
      tooltip: "Download this file",
      label: "Download",
      icon: <DownloadIcon className="h-4 w-4" />,
      onClick: () =>
        downloadBlob(
          file.metadata.name,
          new Blob([codeRef.current], { type: "text/plain;charset=utf-8" }),
        ),
      variant: "default",
    });
    return () => removeAction("download");
  }, [addAction, removeAction, file.metadata.name]);
```

- [ ] **Step 4: Scenario editor — imports + hook + ref + effect**

In `apps/studio/src/features/simulator/scenario/scenario-editor.tsx`:

- Add imports:

```ts
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { downloadBlob } from "@/lib/download.ts";
import { DownloadIcon } from "lucide-react";
```

- Inside `ScenarioEditor`, after `const fs = useFileSystem();` (line 25), add:

```ts
  const { addAction, removeAction } = usePageHeaderActions();
```

- After `const [content, setContent] = useState(file.content as string);` (line 27), add:

```ts
  const contentRef = useRef(content);
  contentRef.current = content;
```

- Add the registration effect after the height effect (around line 47):

```ts
  useEffect(() => {
    addAction({
      id: "download",
      tooltip: "Download this file",
      label: "Download",
      icon: <DownloadIcon className="h-4 w-4" />,
      onClick: () =>
        downloadBlob(
          file.metadata.name,
          new Blob([contentRef.current], { type: "text/plain;charset=utf-8" }),
        ),
      variant: "default",
    });
    return () => removeAction("download");
  }, [addAction, removeAction, file.metadata.name]);
```

> `useRef` is already imported in `smartc-editor.tsx` (line 1), `asm-code-editor.tsx` (line 1) and `scenario-editor.tsx` (line 2); no react-import changes needed. `useEffect` is likewise already imported in all three.

- [ ] **Step 5: Verify the build**

Run (from `apps/studio`):

```bash
bun run build 2>&1 | tail -2
```

Expected: ends with `✅ Build completed`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/smartc-editor/smartc-editor.tsx apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx apps/studio/src/features/simulator/scenario/scenario-editor.tsx
git commit -m "feat(studio): editor header Download action (SmartC/ASM/Scenario)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 11: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full feature test suite**

Run (from `apps/studio`):

```bash
bun test src/lib/file-system/transfer.test.ts src/features/project/filetype-icons.test.ts
```

Expected: all PASS.

- [ ] **Step 2: Run the broader project tests (no regressions)**

Run (from `apps/studio`):

```bash
bun test src/features src/lib 2>&1 | tail -20
```

Expected: no new failures beyond any that already existed on `development` before this work.

- [ ] **Step 3: Build**

Run (from `apps/studio`):

```bash
bun run build 2>&1 | tail -2
```

Expected: `✅ Build completed`.

- [ ] **Step 4: Targeted type check (accept only the known pre-existing monaco errors)**

Run (from `apps/studio`):

```bash
../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep -E "transfer|download|folder-node|file-sidebar-item|left-sidebar|filetype-icons|scenario-editor|asm-code-editor|smartc-editor|file-system"
```

Expected: no output for the new/modified files. (Pre-existing monaco `IStandaloneCodeEditor` "not assignable" errors in `asm-view.tsx` / `debug-view.tsx` are unrelated and acceptable.)

- [ ] **Step 5: Manual smoke test (`bun run dev`)**

Run (from `apps/studio`):

```bash
bun run dev
```

Then in the browser verify:
1. Sidebar file ⋮ → **Download** saves the file's content.
2. Open a SmartC file, edit without saving, header **Download** reflects the unsaved edit. Repeat for an ASM file and a `.scenario.json` file.
3. Folder ⋮ → **Download (zip)** downloads `<folder>.zip`.
4. Folder ⋮ → **Upload File(s)…** — select `.smart.c` + a `.md` → toast reports 1 imported, 1 skipped; only the `.smart.c` appears.
5. Folder ⋮ → **Import ZIP…** — pick the zip from step 3 → contents land inside the folder.
6. Folder ⋮ → **Import Folder…** — pick a directory → it appears as a subfolder with only accepted files.
7. Sidebar header **Import** (upload icon) → pick the zip from step 3 → a new top-level project named after the zip appears (deduped if the name exists).

- [ ] **Step 6: Finish the branch**

Announce and use `superpowers:finishing-a-development-branch` to verify tests and present completion options. (Do not merge to `main`; the user merges `development` themselves.)

---

## Self-Review Notes (author)

- **Spec coverage:** §2 two-gate filtering — extension (`acceptedFileType`, Task 3) **and** text/binary (`decodeTextOrNull`, Task 2) — combined in `importEntries` (Task 4); content *correctness* stays with the editors' existing open-time diagnostics (no import-time change). §3 fflate → Task 1. §4 pure transforms incl. `decodeTextOrNull` + `ImportEntry` → Task 2; `FileTransfer` + `TransferFs` + injected `resolveType` → Task 4; `fs.transfer` accessor → Task 5; `acceptedFileType` → Task 3; `downloadBlob` → Task 6. §5 UI: FileSidebarItem → Task 7; FolderNode (zip/upload/import-zip/import-folder, pickers read bytes → `decodeTextOrNull`) → Task 8; LeftSidebar top-level import → Task 9; editor headers → Task 10. §6 error handling: skip both-gate rejects (counted, never fail), never run the compiler at import, `uniqueName`/`uniqueNameIn` never overwrites, toast on error, inputs reset `value=""` → Tasks 4, 8, 9. §7 testing → Tasks 2/3/4 + manual Task 11. §8 out-of-scope items are not implemented.
- **Decoupling:** `transfer.ts` imports only `fflate` + local types; name-uniqueness is a local `uniqueNameIn` (handles compound extensions like `.smart.c` by splitting on the first dot) so the headless lib never depends on `features/project`.
- **Type consistency:** `TransferFs` method signatures match `FileSystem` (`listFolderContents`, `loadFile<T>`→`File<T>`={content,metadata}, `getFolder`, `createFolder(parentPath,name)`, `addFile<T>`); `ResolveType` returns `string | null` and `acceptedFileType` returns `FileTypes | null` (assignable). `ImportResult` = `{imported, skipped}` used consistently.
```