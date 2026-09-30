import { describe, expect, it } from "bun:test";
import { Address } from "@signumjs/core";
import { allInterpretations, decimalToBigInt, formatValue, slotToBigInt } from "./decode";

const ctx = { prefix: "S" as const, enums: { st: { "0": "idle", "-1": "broken" } } };

describe("slotToBigInt", () => {
  it("reads little-endian", () => {
    expect(slotToBigInt("0100000000000000")).toBe(1n);
    expect(slotToBigInt("0001000000000000")).toBe(256n);
    expect(slotToBigInt("ffffffffffffffff")).toBe(2n ** 64n - 1n);
  });
});

describe("slot and map values agree", () => {
  // The map API returns signed decimals, slots are little-endian hex.
  it.each([
    ["ffffffffffffffff", "-1"],
    ["0000000000000080", "-9223372036854775808"],
    ["ffffffffffffff7f", "9223372036854775807"],
    ["2a00000000000000", "42"],
  ])("%s == %s", (hex, decimal) => {
    expect(slotToBigInt(hex)).toBe(decimalToBigInt(decimal));
    expect(formatValue(slotToBigInt(hex), "long", ctx)).toBe(decimal);
  });
});

describe("formatValue", () => {
  const minus1 = decimalToBigInt("-1");

  it("long, unsigned, hex, bool", () => {
    expect(formatValue(minus1, "unsigned", ctx)).toBe("18446744073709551615");
    expect(formatValue(255n, "hex", ctx)).toBe("0x00000000000000ff");
    expect(formatValue(0n, "bool", ctx)).toBe("false");
    expect(formatValue(7n, "bool", ctx)).toBe("true");
  });

  it("fixed has 8 decimals and trims zeros", () => {
    expect(formatValue(150000000n, "fixed", ctx)).toBe("1.5");
    expect(formatValue(decimalToBigInt("-1"), "fixed", ctx)).toBe("-0.00000001");
    expect(formatValue(200000000n, "fixed", ctx)).toBe("2");
  });

  it("address uses the prefix and shows 0 as 0", () => {
    expect(formatValue(0n, "address", ctx)).toBe("0");
    expect(formatValue(1n, "address", { ...ctx, prefix: "TS" })).toBe(
      Address.fromNumericId("1", "TS").getReedSolomonAddress(),
    );
  });

  it("string reads stored bytes and replaces control characters", () => {
    // "Hi" stored little-endian: 'H'=0x48 'i'=0x69 then zeros
    expect(formatValue(slotToBigInt("4869000000000000"), "string", ctx)).toBe("Hi");
    expect(formatValue(slotToBigInt("0148000000000000"), "string", ctx)).toBe("·H");
    expect(formatValue(slotToBigInt("ff00000000000000"), "string", ctx)).toBe("�");
  });

  it("enum resolves signed values and marks unknown ones", () => {
    expect(formatValue(0n, "enum", { ...ctx, enumName: "st" })).toBe("idle (0)");
    expect(formatValue(minus1, "enum", { ...ctx, enumName: "st" })).toBe("broken (-1)");
    expect(formatValue(5n, "enum", { ...ctx, enumName: "st" })).toBe("? (5)");
    expect(formatValue(5n, "enum", ctx)).toBe("? (5)");
  });
});

describe("allInterpretations", () => {
  it("lists every format but enum, plus the reversed string", () => {
    const kinds = allInterpretations(1n, "S").map((i) => i.kind);
    expect(kinds).toEqual(["long", "unsigned", "fixed", "hex", "address", "string", "stringReversed", "bool"]);
  });
});
