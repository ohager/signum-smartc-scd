import { describe, expect, it } from "bun:test";
import { buildSlotRows, slotCount } from "./data-stack";
import { parseLabelMap, type LabelMap } from "./label-map";
import { upsertSlot } from "./label-map-edits";

// three slots: 1, 2, -1
const data = "0100000000000000" + "0200000000000000" + "ffffffffffffffff";

const map = (text: string): LabelMap => {
  const r = parseLabelMap(text);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("buildSlotRows", () => {
  it("shows unlabelled slots as long", () => {
    const rows = buildSlotRows(data, null, "S");
    expect(slotCount(data)).toBe(3);
    expect(rows.map((r) => r.value)).toEqual(["1", "2", "-1"]);
    expect(rows.every((r) => r.name === null && !r.outOfRange)).toBe(true);
  });

  it("names array slots and marks labels beyond the data", () => {
    const m = map(`{ "version": 1, "name": "x", "codeHashes": [],
      "slots": [ { "index": 1, "name": "arr", "length": 2, "format": "unsigned" },
                 { "index": 9, "name": "ghost" } ] }`);
    const rows = buildSlotRows(data, m, "S");
    expect(rows.map((r) => r.name)).toEqual([null, "arr[0]", "arr[1]", "ghost"]);
    expect(rows[2]!.value).toBe("18446744073709551615");
    expect(rows[3]).toMatchObject({ index: 9, outOfRange: true, hex: null, value: null });
  });

  it("set label → file text → row shows the name", () => {
    const text = `{ "version": 1, "name": "x", "codeHashes": [] }`;
    const rows = buildSlotRows(data, map(upsertSlot(text, { index: 2, name: "flag", format: "bool" })), "S");
    expect(rows[2]).toMatchObject({ name: "flag", value: "true" });
  });

  it("ignores a trailing partial slot", () => {
    expect(slotCount(data + "01")).toBe(3);
  });
});
