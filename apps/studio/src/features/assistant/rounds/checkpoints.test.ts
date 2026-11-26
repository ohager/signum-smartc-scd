import { describe, it, expect, beforeEach } from "bun:test";
import {
  MAX_CHECKPOINTS,
  MemoryCheckpointStore,
  captureProject,
  diffSnapshots,
  restoreProject,
  restoreWithUndo,
  userChangesSince,
  type Checkpoint,
} from "./checkpoints";
import { createTestFs } from "../tools/test-fs";
import type { Clock } from "./round-tracker";
import type { FileSystem } from "@/lib/file-system/file-system";

let fs: FileSystem;
let p: string;

const clock: Clock = { now: () => 1234, setTimeout: () => 0, clearTimeout: () => {} };

beforeEach(async () => {
  fs = createTestFs().fs;
  p = await fs.createFolder(fs.rootFolderId, "p");
});

async function idOf(path: string) {
  const id = fs.getFileIdByPath(path);
  if (!id) throw new Error(`no ${path}`);
  return id;
}

describe("diffSnapshots", () => {
  it("reports added, removed and changed, comparing structured content by value", () => {
    const before = [
      { relPath: "a", type: "t", content: "1" },
      { relPath: "b", type: "t", content: { x: 1 } },
      { relPath: "c", type: "t", content: "gone" },
    ];
    const after = [
      { relPath: "a", type: "t", content: "2" },
      { relPath: "b", type: "t", content: { x: 1 } },
      { relPath: "d", type: "t", content: "new" },
    ];
    expect(diffSnapshots(before, after)).toEqual({ added: ["d"], removed: ["c"], changed: ["a"] });
  });
});

describe("captureProject / restoreProject", () => {
  it("round-trips a changed, added and deleted file plus a removed subfolder", async () => {
    await fs.addFile(p, "a.smart.c", "smartc", "one");
    await fs.addFile(p, "b.md", "markdown", "bee");
    const sub = await fs.createFolder(p, "sub");
    const deep = await fs.createFolder(sub, "deep");
    await fs.addFile(deep, "d.ts", "typescript", "deep");
    const snapshot = await captureProject(fs, p);
    expect(snapshot.map((f) => f.relPath).sort()).toEqual(["a.smart.c", "b.md", "sub/deep/d.ts"]);

    await fs.saveFile(await idOf("/p/a.smart.c"), "changed");
    await fs.deleteFile(await idOf("/p/b.md"));
    await fs.addFile(p, "extra.md", "markdown", "x");
    await fs.deleteFile(await idOf("/p/sub/deep/d.ts"));
    await fs.deleteFolder(sub);

    const result = await restoreProject(fs, p, snapshot);
    expect(result).toEqual({ written: ["a.smart.c"], created: ["b.md", "sub/deep/d.ts"], deleted: ["extra.md"] });

    const after = await captureProject(fs, p);
    expect(diffSnapshots(snapshot, after)).toEqual({ added: [], removed: [], changed: [] });
    expect((await fs.loadFile(await idOf("/p/sub/deep/d.ts"))).content).toBe("deep");
  });

  it("leaves unchanged files untouched", async () => {
    const id = await fs.addFile(p, "a.md", "markdown", "same");
    const snapshot = await captureProject(fs, p);
    const before = fs.getFileMetadata(id)!.lastModified;
    await new Promise((r) => setTimeout(r, 5));
    const result = await restoreProject(fs, p, snapshot);
    expect(result).toEqual({ written: [], created: [], deleted: [] });
    expect(fs.getFileMetadata(id)!.lastModified).toBe(before);
  });

  it("does not touch another project", async () => {
    const q = await fs.createFolder(fs.rootFolderId, "q");
    await fs.addFile(q, "keep.md", "markdown", "k");
    await fs.addFile(p, "a.md", "markdown", "a");
    const snapshot = await captureProject(fs, p);
    await restoreProject(fs, p, []);
    expect(fs.getFileIdByPath("/q/keep.md")).not.toBeNull();
    await restoreProject(fs, p, snapshot);
    expect(fs.getFileIdByPath("/p/a.md")).not.toBeNull();
  });
});

describe("userChangesSince", () => {
  it("names files the user changed after the round, sorted", async () => {
    await fs.addFile(p, "a.md", "markdown", "a");
    await fs.addFile(p, "z.md", "markdown", "z");
    const end = await captureProject(fs, p);
    await fs.saveFile(await idOf("/p/z.md"), "z2");
    await fs.addFile(p, "m.md", "markdown", "m");
    await fs.deleteFile(await idOf("/p/a.md"));
    expect(await userChangesSince(fs, p, end)).toEqual(["a.md", "m.md", "z.md"]);
  });
});

describe("restoreWithUndo", () => {
  it("is undoable: restoring the before-restore checkpoint returns the pre-restore state", async () => {
    const store = new MemoryCheckpointStore();
    await fs.addFile(p, "a.md", "markdown", "old");
    const target: Checkpoint = {
      id: "t",
      projectId: p,
      createdAt: 1,
      reason: "round-start",
      files: await captureProject(fs, p),
    };
    await fs.saveFile(await idOf("/p/a.md"), "agent edit");
    await fs.addFile(p, "new.md", "markdown", "agent file");
    const beforeRestore = await captureProject(fs, p);

    const { undoCheckpointId } = await restoreWithUndo({ fs, store, clock }, p, target);
    expect((await fs.loadFile(await idOf("/p/a.md"))).content).toBe("old");
    expect(fs.getFileIdByPath("/p/new.md")).toBeNull();

    const undo = await store.get(undoCheckpointId);
    expect(undo?.reason).toBe("before-restore");
    expect(undo?.createdAt).toBe(1234);
    await restoreProject(fs, p, undo!.files);
    expect(diffSnapshots(beforeRestore, await captureProject(fs, p))).toEqual({
      added: [],
      removed: [],
      changed: [],
    });
  });
});

describe("MemoryCheckpointStore", () => {
  const cp = (id: string, projectId: string, createdAt: number): Checkpoint => ({
    id,
    projectId,
    createdAt,
    reason: "round-start",
    files: [],
  });

  it("lists newest first per project", async () => {
    const store = new MemoryCheckpointStore();
    await store.put(cp("1", "a", 1));
    await store.put(cp("3", "a", 3));
    await store.put(cp("2", "a", 2));
    await store.put(cp("x", "b", 9));
    expect((await store.list("a")).map((c) => c.id)).toEqual(["3", "2", "1"]);
    expect(await store.get("x")).toBeDefined();
    expect(await store.get("nope")).toBeUndefined();
  });

  it("breaks createdAt ties by insertion order, newest first", async () => {
    const store = new MemoryCheckpointStore();
    await store.put(cp("first", "a", 5));
    await store.put(cp("second", "a", 5));
    expect((await store.list("a")).map((c) => c.id)).toEqual(["second", "first"]);
    await store.prune("a", 1);
    expect((await store.list("a")).map((c) => c.id)).toEqual(["second"]);
  });

  it("keeps the last 20 per project", async () => {
    expect(MAX_CHECKPOINTS).toBe(20);
    const store = new MemoryCheckpointStore();
    for (let i = 0; i < 25; i++) await store.put(cp(`a${i}`, "a", i));
    for (let i = 0; i < 3; i++) await store.put(cp(`b${i}`, "b", i));
    await store.prune("a", MAX_CHECKPOINTS);
    const kept = await store.list("a");
    expect(kept).toHaveLength(20);
    expect(kept[0]!.id).toBe("a24");
    expect(kept[19]!.id).toBe("a5");
    expect(await store.get("a4")).toBeUndefined();
    expect(await store.list("b")).toHaveLength(3);
  });
});
