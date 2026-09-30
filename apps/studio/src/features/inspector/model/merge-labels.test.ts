import { describe, expect, it } from "bun:test";
import { parseLabelMap, type LabelMap } from "./label-map";
import { applyMerge, mergeGenerated } from "./merge-labels";

const existing: LabelMap = {
  version: 1, name: "M", codeHashes: [{ hash: "1" }], slots: [
    { index: 0, name: "old", origin: "compiler" },
    { index: 1, name: "mine", origin: "manual" },
    { index: 5, name: "import", origin: "imported" },
  ], maps: [], enums: {}, codeLabels: [{ address: 1, name: "gone", origin: "compiler" }],
};

const generated = {
  slots: [
    { index: 0, name: "counter", format: "long" as const, origin: "compiler" as const },
    { index: 1, name: "owner", format: "address" as const, origin: "compiler" as const },
    { index: 2, name: "rate", format: "fixed" as const, origin: "compiler" as const },
  ],
  codeLabels: [{ address: 7, name: "main", origin: "compiler" as const }],
  codeHash: "2",
  typed: true,
};

describe("mergeGenerated", () => {
  const { map, conflicts } = mergeGenerated(existing, generated, {
    sourceFile: "c.smart.c", now: new Date("2026-09-30T12:00:00Z"), network: "testnet",
  });

  it("replaces compiler entries and keeps manual and imported ones", () => {
    expect(map.slots.map((s) => `${s.index}:${s.name}`)).toEqual(["0:counter", "1:mine", "2:rate", "5:import"]);
    expect(map.codeLabels).toEqual(generated.codeLabels);
  });

  it("reports manual entries that shadow a compiler slot", () => {
    expect(conflicts).toEqual([{ index: 1, manual: "mine", compiler: "owner" }]);
  });

  it("adds the hash once and records the source", () => {
    expect(map.codeHashes).toEqual([{ hash: "1" }, { hash: "2", network: "testnet" }]);
    expect(map.source).toEqual({ file: "c.smart.c", generatedAt: "2026-09-30T12:00:00.000Z" });
    const again = mergeGenerated(map, generated, { sourceFile: "c.smart.c", now: new Date() });
    expect(again.map.codeHashes).toHaveLength(2);
  });
});

describe("applyMerge", () => {
  it("keeps comments outside the replaced collections", () => {
    const text = `{
  // header
  "version": 1, "name": "M",
  "codeHashes": [],
  "enums": { "e": { "0": "zero" } } // keep
}`;
    const r = parseLabelMap(text);
    if (!r.ok) throw new Error("fixture");
    const merged = mergeGenerated(r.value, generated, { sourceFile: "c.smart.c", now: new Date(0) }).map;
    const out = applyMerge(text, merged);
    expect(out).toContain("// header");
    expect(out).toContain("// keep");
    const back = parseLabelMap(out);
    expect(back.ok && back.value.slots.length).toBe(3);
    expect(back.ok && back.value.enums).toEqual({ e: { "0": "zero" } });
  });
});

describe("applyMerge keeps comments the user wrote inside the merged collections", () => {
  it("keeps a comment on a hash and above a manual slot", () => {
    const text = `{
  "version": 1, "name": "M",
  "codeHashes": [
    { "hash": "2" } // mainnet build, OWNER=S-X
  ],
  "slots": [
    { "index": 0, "name": "old", "origin": "compiler" },
    // mine, do not touch
    { "index": 1, "name": "mine", "origin": "manual" }
  ]
}`;
    const r = parseLabelMap(text);
    if (!r.ok) throw new Error("fixture");
    const merged = mergeGenerated(r.value, generated, { sourceFile: "c.smart.c", now: new Date(0) }).map;
    const out = applyMerge(text, merged);
    expect(out).toContain("// mainnet build, OWNER=S-X");
    expect(out).toContain("// mine, do not touch");
    const back = parseLabelMap(out);
    if (!back.ok) throw new Error(JSON.stringify(back.errors));
    expect(back.value.slots.map((s) => `${s.index}:${s.name}`)).toEqual(["0:counter", "1:mine", "2:rate"]);
    expect(back.value.codeHashes.map((h) => h.hash)).toEqual(["2"]);
    expect(back.value.codeLabels).toEqual(generated.codeLabels);
    expect(back.value.source?.file).toBe("c.smart.c");
  });
});
