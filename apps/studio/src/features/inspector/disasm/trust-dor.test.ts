import { describe, expect, it } from "bun:test";
import { parseLabelMap, type LabelMap } from "../model/label-map";
import { importDorMap, parseDorMap, toDorMap } from "./dor-map";
import { trustOf } from "./trust";

const map: LabelMap = {
  version: 1, name: "m", codeHashes: [{ hash: "77" }], source: { file: "a.smart.c", generatedAt: "x", codeHash: "77" },
  slots: [{ index: 1, name: "owner", origin: "compiler" }, { index: 3, name: "my.flag", origin: "manual" }],
  maps: [], enums: {}, codeLabels: [{ address: 8, name: "__fn_main", origin: "compiler" }],
};

describe("trustOf", () => {
  it("verifies compiler labels only for the build they came from", () => {
    expect(trustOf("compiler", map, "77")).toBe("verified");
    expect(trustOf("compiler", map, "78")).toBe("otherBuild");
    expect(trustOf("manual", map, "77")).toBe("claim");
    expect(trustOf("imported", map, "77")).toBe("claim");
    expect(trustOf(undefined, map, "77")).toBe("claim");
  });
});

describe("D'Or MAP", () => {
  it("exports asm names in slot order and code labels", () => {
    expect(toDorMap(map)).toEqual({
      Memory: ["var_000", "owner", "var_002", "my_flag"],
      Labels: [{ label: "__fn_main", address: 8 }],
    });
  });

  it("imports names as claims without overwriting existing entries or importing generated names", () => {
    const text = `{ "version": 1, "name": "m", "codeHashes": [], "slots": [ { "index": 1, "name": "keep" } ] }`;
    const dor = parseDorMap(`{ "Memory": ["r0", "owner", "var02", "price"], "Labels": [{ "label": "lab_1a", "address": 26 }, { "label": "__fn_sell", "address": 40 }] }`);
    if (!dor.ok) throw new Error("fixture");
    const { text: out, added } = importDorMap(text, dor.value);
    const r = parseLabelMap(out);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.slots).toEqual([
      { index: 1, name: "keep" },
      { index: 3, name: "price", origin: "imported" },
    ]);
    expect(r.value.codeLabels).toEqual([{ address: 40, name: "__fn_sell", origin: "imported" }]);
    expect(added).toBe(2);
  });

  it("rejects something that is not a MAP", () => {
    expect(parseDorMap(`{ "Memory": "x" }`).ok).toBe(false);
  });
});
