import { describe, expect, it } from "bun:test";
import type { LabelMap, SlotLabel } from "@/features/inspector/model/label-map";
import { baseFromByteData, buildDataStack, paramSlots } from "./deploy-params";

const p = (index: number, extra: Partial<SlotLabel> = {}): SlotLabel =>
  ({ index, name: `p${index}`, format: "long", param: true, ...extra });
const emptyMap: LabelMap = { version: 1, name: "M", codeHashes: [], slots: [], maps: [], enums: {}, codeLabels: [] };
const ctx = { prefix: "S" as const, enums: {} };

describe("paramSlots", () => {
  it("map wins, pointers and arrays dropped", () => {
    const generated = [p(3), { index: 5, name: "arr", comment: "array pointer", param: true } as SlotLabel, p(6, { length: 2 })];
    const map = { ...emptyMap, slots: [p(3, { name: "owner", format: "address" }), { index: 7, name: "fee", format: "long" } as SlotLabel] };
    expect(paramSlots(generated, map).map((s) => s.name)).toEqual(["owner"]);
  });

  it("a stored compiler entry does not hide a generated suggestion; a manual one decides", () => {
    const generated = [p(3, { origin: "compiler" }), p(4, { origin: "compiler" })];
    const map = {
      ...emptyMap,
      slots: [
        { index: 3, name: "p3", format: "long", origin: "compiler" } as SlotLabel,
        { index: 4, name: "p4", format: "long", origin: "manual" } as SlotLabel,
      ],
    };
    expect(paramSlots(generated, map).map((s) => s.index)).toEqual([3]);
  });

  it("works without a map and without generated labels", () => {
    expect(paramSlots([p(2), p(1)], null).map((s) => s.index)).toEqual([1, 2]);
    expect(paramSlots(null, { ...emptyMap, slots: [p(4)] }).map((s) => s.index)).toEqual([4]);
  });
});

describe("buildDataStack", () => {
  it("fills gaps up to the highest parameter", () => {
    const r = buildDataStack({ params: [p(1), p(4, { default: "9" })], values: { 1: "-1" }, ctx, capacity: 32, memory: ["r0", "x", "y", "n32", "z"] });
    expect(r.data).toEqual(["0", "18446744073709551615", "0", "0", "9"]);
    expect(r.rows.map((x) => x.kind)).toEqual(["internal", "param", "filler", "internal", "param"]);
  });

  it("keeps the compiler's initial memory under and beyond the parameters", () => {
    // f100000000 at slot 1 and an array pointer at slot 4 come from ByteData.
    const base = [0n, 100_000_000n, 0n, 0n, 6n];
    const r = buildDataStack({ params: [p(2)], values: { 2: "5" }, ctx, capacity: 32, base, memory: ["r0", "f100000000", "x", "y", "arr"] });
    expect(r.data).toEqual(["0", "100000000", "5", "0", "6"]);
    expect(r.rows[1]).toMatchObject({ kind: "internal", raw: 100_000_000n });
  });

  it("no parameters still sends the initial memory", () => {
    expect(buildDataStack({ params: [], values: {}, ctx, capacity: 32 }).data).toEqual([]);
    expect(buildDataStack({ params: [], values: {}, ctx, capacity: 32, base: [0n, 7n, 0n] }).data).toEqual(["0", "7"]);
  });

  it("an empty field takes the default, then the initial memory, then 0", () => {
    const r = buildDataStack({ params: [p(0, { default: "3" }), p(1), p(2)], values: { 0: " " }, ctx, capacity: 32, base: [1n, 2n] });
    expect(r.data).toEqual(["3", "2", "0"]);
  });

  it("a field error blocks the data", () => {
    const r = buildDataStack({ params: [p(0)], values: { 0: "x" }, ctx, capacity: 32 });
    expect(r.data).toBeNull();
    expect(r.fields[0]!.error).toBe("invalid");
  });

  it("encodes with the slot's enum", () => {
    const r = buildDataStack({ params: [p(0, { format: "enum", enum: "S" })], values: { 0: "Open" }, ctx: { prefix: "S", enums: { S: { "1": "Open" } } }, capacity: 32 });
    expect(r.data).toEqual(["1"]);
  });

  it("rejects data beyond capacity", () => {
    const r = buildDataStack({ params: [p(40)], values: {}, ctx, capacity: 32 });
    expect(r.tooLarge).toBe(true);
    expect(r.data).toBeNull();
  });

  it("names filler rows from the labels", () => {
    const r = buildDataStack({ params: [p(1)], values: {}, ctx, capacity: 32, labels: [{ index: 0, name: "counter" }] });
    expect(r.rows[0]).toMatchObject({ index: 0, name: "counter", kind: "filler" });
  });
});

describe("baseFromByteData", () => {
  it("reads little-endian slots and drops trailing zeros", () =>
    expect(baseFromByteData("0000000000000000" + "00e1f50500000000" + "0000000000000000")).toEqual([0n, 100_000_000n]));
});
