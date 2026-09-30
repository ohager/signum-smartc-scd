import { describe, expect, it } from "bun:test";
import { parseLabelMap } from "./label-map";
import {
  addCodeHash,
  removeCodeHash,
  removeMapGroup,
  removeSlot,
  setEnum,
  upsertMapGroup,
  upsertSlot,
} from "./label-map-edits";

const base = `{
  // top comment
  "version": 1,
  "name": "M",
  "codeHashes": [ { "hash": "1" } ], // hashes
  "slots": [
    { "index": 3, "name": "a", "origin": "compiler" }, // slot a
    { "index": 9, "name": "c" }
  ]
}`;

const parsed = (text: string) => {
  const r = parseLabelMap(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("upsertSlot", () => {
  it("inserts in index order and keeps comments byte-identical", () => {
    const out = upsertSlot(base, { index: 5, name: "b" });
    expect(parsed(out).slots.map((s) => s.index)).toEqual([3, 5, 9]);
    for (const c of ["// top comment", "// hashes", "// slot a"]) expect(out).toContain(c);
  });

  it("replaces an existing index and marks it manual", () => {
    const out = upsertSlot(base, { index: 3, name: "renamed", format: "bool" });
    const slot = parsed(out).slots[0]!;
    expect(slot).toEqual({ index: 3, name: "renamed", format: "bool", origin: "manual" });
  });

  it("creates the slots array when the file has none", () => {
    const out = upsertSlot(`{ "version": 1, "name": "M", "codeHashes": [] }`, { index: 0, name: "x" });
    expect(parsed(out).slots).toEqual([{ index: 0, name: "x", origin: "manual" }]);
  });

  it("throws on a file that does not parse", () => {
    expect(() => upsertSlot("{", { index: 0, name: "x" })).toThrow();
  });
});

describe("removeSlot", () => {
  it("removes by index", () => {
    expect(parsed(removeSlot(base, 9)).slots.map((s) => s.index)).toEqual([3]);
  });
});

describe("map groups", () => {
  it("upserts fixed groups by key1 and pattern groups by format and name", () => {
    let out = upsertMapGroup(base, { key1: "10", name: "Perms" });
    out = upsertMapGroup(out, { key1: "10", name: "Permissions" });
    out = upsertMapGroup(out, { key1Format: "address", name: "Accounts" });
    const maps = parsed(out).maps;
    expect(maps).toHaveLength(2);
    expect(maps[0]!.name).toBe("Permissions");
    expect(parsed(removeMapGroup(out, 0)).maps).toHaveLength(1);
    expect(out).toContain("// top comment");
  });
});

describe("code hashes and enums", () => {
  it("adds a hash once and removes it", () => {
    const once = addCodeHash(base, { hash: "2", network: "testnet" });
    expect(addCodeHash(once, { hash: "2" })).toBe(once);
    expect(parsed(once).codeHashes.map((h) => h.hash)).toEqual(["1", "2"]);
    expect(parsed(removeCodeHash(once, "1")).codeHashes.map((h) => h.hash)).toEqual(["2"]);
  });

  it("sets an enum", () => {
    const out = setEnum(base, "status", { "0": "idle", "1": "sale" });
    expect(parsed(out).enums).toEqual({ status: { "0": "idle", "1": "sale" } });
  });
});
