import { describe, expect, it } from "bun:test";
import { isLabelMapName, isWatchlistName, loadLabelMaps } from "./label-map-index";

const files = [
  { id: "a", name: "a.labels.json", path: "/P/a.labels.json" },
  { id: "b", name: "b.labels.json", path: "/P/b.labels.json" },
  { id: "c", name: "c.smart.c", path: "/P/c.smart.c" },
];
const contents: Record<string, string> = {
  a: `{ "version": 1, "name": "A", "codeHashes": [{ "hash": "1" }] }`,
  b: `{ "version": 1 `,
};
const fs = {
  listFilesRecursive: () => files,
  loadFile: async <T,>(id: string) => ({ content: contents[id] as T }),
};

describe("loadLabelMaps", () => {
  it("indexes every labels file, invalid ones with errors", async () => {
    const maps = await loadLabelMaps(fs);
    expect(maps.map((m) => m.fileId)).toEqual(["a", "b"]);
    expect(maps[0]!.map?.name).toBe("A");
    expect(maps[1]!.map).toBeNull();
    expect(maps[1]!.errors.length).toBeGreaterThan(0);
  });

  it("recognises the two file types by suffix", () => {
    expect(isLabelMapName("X.LABELS.JSON")).toBe(true);
    expect(isWatchlistName("deployments.inspect.json")).toBe(true);
    expect(isWatchlistName("a.json")).toBe(false);
  });
});
