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

  async createFolder(parentFolderId: string, name: string) {
    const parent = this.folders.get(parentFolderId)!;
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
    const target = await fs.createFolder("root", "proj");
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

  // Was written with two `.smart.c` imports. A project now holds exactly one
  // contract, so a second one is skipped rather than renamed — which would
  // test the contract rule, not the dedupe rule. Scenarios have no such limit
  // and keep this about what it was always about.
  it("dedupes names within a folder (never overwrites)", async () => {
    const fs = new FakeFs();
    const target = await fs.createFolder("root", "proj");
    const t = new FileTransfer(fs);

    await t.importEntries(target, [{ path: "a.scenario.json", content: "1" }], testResolve);
    await t.importEntries(target, [{ path: "a.scenario.json", content: "2" }], testResolve);

    const names = fs.listFolderContents(target).files.map((f) => f.metadata.name);
    expect(names.sort()).toEqual(["a-2.scenario.json", "a.scenario.json"]);
  });

  it("reuses an existing subfolder of the same name", async () => {
    const fs = new FakeFs();
    const target = await fs.createFolder("root", "proj");
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
    const proj = await fs.createFolder("root", "proj");
    await fs.addFile(proj, "main.smart.c", "smartc", "long a;");
    const scen = await fs.createFolder(proj, "scenarios");
    await fs.addFile(scen, "s1.scenario.json", "scenario", '{"v":2}');
    const t = new FileTransfer(fs);

    const entries = await t.collectFolderEntries(proj);
    expect(entries.map((e) => e.path).sort()).toEqual([
      "main.smart.c",
      "scenarios/s1.scenario.json",
    ]);

    const zip = await t.exportFolderZip(proj);
    const target = await fs.createFolder("root", "restored");
    const res = await t.importZip(target, zip, testResolve);

    expect(res.imported).toBe(2);
    const top = fs.listFolderContents(target);
    expect(top.files.map((f) => f.metadata.name)).toEqual(["main.smart.c"]);
    const sub = top.folders.find((f) => f.metadata.name === "scenarios")!;
    expect(fs.listFolderContents(sub.id).files.map((f) => f.metadata.name)).toEqual([
      "s1.scenario.json",
    ]);
  });

  it("imports at most one contract, because a project holds exactly one", async () => {
    const fs = new FakeFs();
    const target = await fs.createFolder("root", "proj");
    const t = new FileTransfer(fs);

    const result = await t.importEntries(
      target,
      [
        { path: "a.smart.c", content: "long a;" },
        { path: "b.smart.c", content: "long b;" },
        { path: "a.scenario.json", content: '{"v":2}' },
      ],
      testResolve,
    );

    expect(result.imported).toBe(2);
    expect(result.skipped).toBe(1);
    expect(
      fs.listFolderContents(target).files.filter((f) => f.metadata.name.endsWith(".smart.c")),
    ).toHaveLength(1);
  });

  it("skips an imported contract when the project already has one", async () => {
    const fs = new FakeFs();
    const target = await fs.createFolder("root", "proj");
    await fs.addFile(target, "main.smart.c", "smartc", "long a;");
    const t = new FileTransfer(fs);

    const result = await t.importEntries(
      target,
      [{ path: "other.smart.c", content: "long b;" }],
      testResolve,
    );

    expect(result.imported).toBe(0);
    expect(result.skipped).toBe(1);
  });
});
