import { describe, expect, it } from "bun:test";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import {
  BYTE_GROUP,
  PAGE_BYTES,
  initialValue,
  largestRowFitting,
  pageBudget,
  rowColumns,
} from "./machine-image.ts";

function machine(overrides: Partial<MachineData> = {}): MachineData {
  return {
    Warnings: "",
    DataPages: 0,
    CodeStackPages: 0,
    UserStackPages: 0,
    CodePages: 0,
    MinimumFeeNQT: "0",
    ByteCode: "",
    MachineCodeHashId: "0",
    ByteData: "",
    Memory: [],
    Labels: [],
    AssemblyCode: "",
    PName: "",
    PDescription: "",
    PActivationAmount: "0",
    ...overrides,
  } as MachineData;
}

describe("pageBudget", () => {
  it("fills the last code page in proportion to the bytes on it", () => {
    const [code] = pageBudget(
      machine({ ByteCode: "ab".repeat(PAGE_BYTES + 64), CodePages: 2 }),
    );
    expect(code.count).toBe(2);
    expect(code.lastFill).toBeCloseTo(64 / PAGE_BYTES);
  });

  it("shows a page that ends exactly on its boundary as full", () => {
    const [code] = pageBudget(
      machine({ ByteCode: "ab".repeat(PAGE_BYTES), CodePages: 1 }),
    );
    expect(code.lastFill).toBe(1);
  });

  it("leaves an unused kind empty rather than full", () => {
    const [code, data] = pageBudget(machine());
    expect(code.lastFill).toBe(0);
    expect(data.lastFill).toBe(0);
  });

  it("measures data pages in slots, not bytes", () => {
    const [, data] = pageBudget(
      machine({
        Memory: Array.from({ length: 40 }, (_, i) => `v${i}`),
        DataPages: 2,
      }),
    );
    expect(data.lastFill).toBeCloseTo(8 / 32);
  });
});

describe("initialValue", () => {
  it("reads a slot as a little-endian long", () => {
    // 0x0102 stored low byte first.
    expect(initialValue("0201000000000000", 0)).toBe(0x0102n);
  });

  it("reads the slot at its own offset", () => {
    expect(initialValue("0000000000000000" + "ff00000000000000", 1)).toBe(255n);
  });

  it("treats a slot beyond the written image as zero", () => {
    expect(initialValue("0201000000000000", 7)).toBe(0n);
  });

  it("keeps precision past what a number could hold", () => {
    expect(initialValue("ffffffffffffffff", 0)).toBe(18446744073709551615n);
  });
});

describe("largestRowFitting", () => {
  it("never returns a row that would wrap", () => {
    for (let columns = 10; columns < 300; columns += 1) {
      const bytes = largestRowFitting(columns);
      expect(bytes % BYTE_GROUP).toBe(0);
      if (bytes > BYTE_GROUP)
        expect(rowColumns(bytes)).toBeLessThanOrEqual(columns);
    }
  });

  it("grows the row as the panel widens", () => {
    expect(largestRowFitting(40)).toBe(8);
    expect(largestRowFitting(rowColumns(16))).toBe(16);
    expect(largestRowFitting(rowColumns(32))).toBe(32);
  });

  it("keeps a readable row even in a panel too narrow for one", () => {
    expect(largestRowFitting(1)).toBe(BYTE_GROUP);
  });
});
