import { describe, it, expect } from "bun:test";

// The FileSystem singleton is built at module load and reads localStorage, so the
// stub and the seed metadata must both exist before the dynamic import below.
const LS_METADATA_KEY = "scd:fs-metadata";

function folder(id: string, name: string, path: string) {
  return { id, name, path, createdAt: 0, lastModified: 0 };
}

function file(id: string, folderId: string, name: string, path: string, type: string) {
  return { id, folderId, name, path, type, lastModified: 0 };
}

/**
 * A project with a nested tests folder:
 *
 *   /demo/counter.smart.c
 *   /demo/tests/counter.test.ts
 *   /demo/tests/helpers/context.ts
 *   /demo/docs/                 ← an empty subtree
 *   /other/stray.smart.c        ← a sibling project, must never be included
 */
const seed = {
  files: {
    c1: file("c1", "demo", "counter.smart.c", "/demo/counter.smart.c", "smartc"),
    t1: file("t1", "tests", "counter.test.ts", "/demo/tests/counter.test.ts", "test"),
    h1: file("h1", "helpers", "context.ts", "/demo/tests/helpers/context.ts", "test"),
    s1: file("s1", "other", "stray.smart.c", "/other/stray.smart.c", "smartc"),
  },
  folders: {
    root: folder("root", "@@Root", "/"),
    demo: folder("demo", "demo", "/demo"),
    tests: folder("tests", "tests", "/demo/tests"),
    helpers: folder("helpers", "helpers", "/demo/tests/helpers"),
    docs: folder("docs", "docs", "/demo/docs"),
    other: folder("other", "other", "/other"),
  },
  folderContents: {
    root: { files: [], folders: ["demo", "other"] },
    demo: { files: ["c1"], folders: ["tests", "docs"] },
    tests: { files: ["t1"], folders: ["helpers"] },
    helpers: { files: ["h1"], folders: [] },
    docs: { files: [], folders: [] },
    other: { files: ["s1"], folders: [] },
  },
  rootFolder: "root",
  recentFiles: [],
};

const store = new Map<string, string>([[LS_METADATA_KEY, JSON.stringify(seed)]]);
(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
};

const { FileSystem } = await import("./file-system");
const fs = FileSystem.getInstance();

const pathsIn = (folderId?: string) => fs.listFilesRecursive(folderId).map((f) => f.path);

describe("listFilesRecursive", () => {
  it("returns files from nested folders at any depth", () => {
    expect(pathsIn("demo").sort()).toEqual([
      "/demo/counter.smart.c",
      "/demo/tests/counter.test.ts",
      "/demo/tests/helpers/context.ts",
    ]);
  });

  it("is scoped to the folder it is given, not the whole file system", () => {
    expect(pathsIn("demo")).not.toContain("/other/stray.smart.c");
    expect(pathsIn("tests").sort()).toEqual([
      "/demo/tests/counter.test.ts",
      "/demo/tests/helpers/context.ts",
    ]);
  });

  it("walks the whole tree when given no folder", () => {
    expect(pathsIn().length).toBe(4);
  });

  it("returns an empty array for a subtree containing no files", () => {
    // Note `root` would NOT be empty: it has no direct files but plenty below it.
    expect(pathsIn("docs")).toEqual([]);
  });

  it("returns full metadata, not just paths", () => {
    const found = fs.listFilesRecursive("helpers");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: "h1", name: "context.ts", type: "test" });
  });

  it("throws for an unknown folder, like listFolderContents does", () => {
    expect(() => fs.listFilesRecursive("nope")).toThrow(/Folder not found: nope/);
  });
});
