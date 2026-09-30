import { describe, expect, it } from "bun:test";
import type { LabelMap } from "./label-map";
import { resolveLabelMap, type IndexedLabelMap } from "./resolve-label-map";

const lm = (name: string, hashes: string[]): LabelMap => ({
  version: 1, name, codeHashes: hashes.map((hash) => ({ hash })), slots: [], maps: [], enums: {}, codeLabels: [],
});
const entry = (path: string, map: LabelMap | null): IndexedLabelMap => ({
  fileId: path, path, name: path.split("/").pop()!, map, errors: [],
});

const a = entry("/P/a.labels.json", lm("A", ["1", "2"]));
const b = entry("/Q/b.labels.json", lm("B", ["2"]));
const broken = entry("/Q/broken.labels.json", null);

describe("resolveLabelMap", () => {
  it("prefers a pinned map by path or file name", () => {
    expect(resolveLabelMap("9", "/Q/b.labels.json", [a, b])).toMatchObject({ kind: "pinned", entry: b });
    expect(resolveLabelMap("9", "b.labels.json", [a, b])).toMatchObject({ kind: "pinned", entry: b });
  });

  it("falls back to hash matching when the pinned file is gone", () => {
    expect(resolveLabelMap("1", "gone.labels.json", [a, b])).toEqual({
      kind: "hash", entry: a, pinnedMissing: "gone.labels.json",
    });
  });

  it("matches by hash, reports ambiguity and none, and skips invalid files", () => {
    expect(resolveLabelMap("1", undefined, [a, b, broken])).toEqual({ kind: "hash", entry: a });
    expect(resolveLabelMap("2", undefined, [a, b])).toEqual({ kind: "ambiguous", candidates: [a, b] });
    expect(resolveLabelMap("3", undefined, [a, b])).toEqual({ kind: "none" });
  });

  it("does not pin an invalid file", () => {
    expect(resolveLabelMap("1", "broken.labels.json", [a, broken])).toEqual({
      kind: "hash", entry: a, pinnedMissing: "broken.labels.json",
    });
  });
});
