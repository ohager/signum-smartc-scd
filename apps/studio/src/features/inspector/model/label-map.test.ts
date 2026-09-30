import { describe, expect, it } from "bun:test";
import { emptyLabelMap, isFixedGroup, parseLabelMap } from "./label-map";

const full = `{
  // NFT market labels
  "version": 1,
  "name": "NFT Market",
  "codeHashes": [
    { "hash": "8421", "network": "mainnet", "note": "#define OWNER" },
    { "hash": "1337" },
  ],
  "source": { "file": "nft.smart.c", "generatedAt": "2026-09-30T12:00:00Z" },
  "slots": [
    { "index": 7, "name": "isOnSale", "format": "enum", "enum": "saleStatus", "origin": "manual" },
    { "index": 12, "name": "prices", "format": "long", "length": 5, "origin": "compiler" }
  ],
  "maps": [
    { "key1": "10", "name": "User Permissions", "key2Format": "address", "valueFormat": "enum", "enum": "permission" },
    { "key1Format": "address", "name": "Account Data",
      "key2": [{ "key2": "1", "name": "balance", "valueFormat": "long" }] }
  ],
  "enums": {
    "saleStatus": { "0": "idle", "1": "on sale" },
    "permission": { "1": "minter" }
  },
  "codeLabels": [{ "address": 420, "name": "sellNft", "origin": "compiler" }]
}`;

describe("parseLabelMap", () => {
  it("accepts the full format with comments", () => {
    const r = parseLabelMap(full);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.slots[1]!.length).toBe(5);
    expect(isFixedGroup(r.value.maps[0]!)).toBe(true);
    expect(isFixedGroup(r.value.maps[1]!)).toBe(false);
  });

  it("fills missing optional collections with empty ones", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [] }`);
    expect(r.ok && r.value).toMatchObject({ slots: [], maps: [], enums: {}, codeLabels: [] });
  });

  it("rejects an unknown format at the right line", () => {
    const r = parseLabelMap(`{
  "version": 1, "name": "x", "codeHashes": [],
  "slots": [ { "index": 1, "name": "a", "format": "float" } ]
}`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toEqual(["slots", 0, "format"]);
    expect(r.errors[0]!.line).toBe(3);
  });

  it("rejects a non-decimal key1", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [],
      "maps": [ { "key1": "0x10", "name": "m" } ] }`);
    expect(r.ok).toBe(false);
  });

  it("requires enum formats to name a defined enum", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [],
      "slots": [ { "index": 1, "name": "a", "format": "enum", "enum": "nope" } ] }`);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toEqual(["slots", 0, "enum"]);
  });

  it("rejects a wrong type without throwing", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [], "slots": { } }`);
    expect(r.ok).toBe(false);
  });
});

describe("emptyLabelMap", () => {
  it("round-trips", () => {
    const r = parseLabelMap(emptyLabelMap("NFT", [{ hash: "1" }]));
    expect(r.ok && r.value.codeHashes).toEqual([{ hash: "1" }]);
  });
});
