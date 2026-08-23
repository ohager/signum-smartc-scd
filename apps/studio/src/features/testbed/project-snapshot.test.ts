import { describe, it, expect } from "bun:test";
import { snapshotProject, isTestEntry, type SnapshotSource } from "./project-snapshot";

/**
 * Stands in for FileSystem. The real class reads `localStorage` when its module
 * loads, so tests supply just the two methods `snapshotProject` calls.
 */
function fakeFs(files: { id: string; path: string }[], contents: Record<string, string>): SnapshotSource {
  return {
    listFilesRecursive: () => files.map((f) => ({ id: f.id, path: f.path })),
    loadFile: async (fileId: string) => ({ content: contents[fileId] }),
  } as unknown as SnapshotSource;
}

describe("snapshotProject", () => {
  it("splits .ts sources from .smart.c contract sources", async () => {
    const fs = fakeFs(
      [
        { id: "c1", path: "/proj/counter.smart.c" },
        { id: "t1", path: "/proj/tests/counter.test.ts" },
        { id: "h1", path: "/proj/tests/context.ts" },
      ],
      { c1: "#program name Counter", t1: "// test", h1: "// helper" },
    );

    const snap = await snapshotProject(fs, "proj");

    expect(snap.tsFiles).toEqual({
      "/proj/tests/counter.test.ts": "// test",
      "/proj/tests/context.ts": "// helper",
    });
    expect(snap.rawFiles).toEqual({ "/proj/counter.smart.c": "#program name Counter" });
  });

  it("ignores file types the runner has no use for", async () => {
    const fs = fakeFs(
      [
        { id: "s", path: "/proj/x.scenario.json" },
        { id: "a", path: "/proj/x.asm" },
        { id: "t", path: "/proj/x.test.ts" },
      ],
      { s: "{}", a: "SET @a", t: "// test" },
    );
    const snap = await snapshotProject(fs, "proj");
    expect(Object.keys(snap.tsFiles)).toEqual(["/proj/x.test.ts"]);
    expect(snap.rawFiles).toEqual({});
  });

  it("scopes the snapshot to the project folder it is given", async () => {
    const calls: (string | undefined)[] = [];
    const fs = {
      listFilesRecursive: (folderId?: string) => {
        calls.push(folderId);
        return [];
      },
      loadFile: async () => ({ content: "" }),
    } as unknown as SnapshotSource;

    await snapshotProject(fs, "demo");
    expect(calls).toEqual(["demo"]);
  });

  it("returns empty maps for an empty project", async () => {
    const snap = await snapshotProject(fakeFs([], {}), "proj");
    expect(snap.tsFiles).toEqual({});
    expect(snap.rawFiles).toEqual({});
  });

  it("treats a file with no content as empty rather than failing", async () => {
    const fs = fakeFs([{ id: "t", path: "/proj/x.test.ts" }], {});
    const snap = await snapshotProject(fs, "proj");
    expect(snap.tsFiles["/proj/x.test.ts"]).toBe("");
  });

  it("treats only .test.ts files as run entries", () => {
    expect(isTestEntry("/proj/tests/counter.test.ts")).toBe(true);
    expect(isTestEntry("/proj/tests/context.ts")).toBe(false);
    expect(isTestEntry("/proj/counter.smart.c")).toBe(false);
  });
});
