import { describe, expect, it } from "bun:test";
import { generateDataStack } from "@signumjs/contracts";
import { formatValue } from "./decode";
import { encodeValue, toContractData } from "./encode";
import type { ValueFormat } from "./formats";

const ctx = { prefix: "S" as const, enums: { State: { "0": "Idle", "1": "Open" } }, enumName: "State" };

describe("encodeValue", () => {
  const cases: [ValueFormat, string][] = [
    ["long", "-1"], ["long", "9223372036854775807"], ["long", "-9223372036854775808"],
    ["unsigned", "18446744073709551615"], ["fixed", "2.5"], ["fixed", "-0.00000001"],
    ["hex", "0x00000000000000ff"], ["string", "Hello"], ["bool", "true"], ["enum", "Open"],
    ["address", "S-2222-2222-2222-22222"], ["address", "0"],
  ];

  it.each(cases)("round-trips through formatValue: %s %s", (format, input) => {
    const r = encodeValue(input, format, ctx);
    if (!r.ok) throw new Error(r.error);
    expect(encodeValue(formatValue(r.raw, format, ctx).replace(/ \(-?\d+\)$/, ""), format, ctx)).toEqual(r);
  });

  it("accepts a numeric id for address", () =>
    expect(encodeValue("1234567890", "address", ctx)).toEqual({ ok: true, raw: 1234567890n }));

  it("encodes text little-endian, byte 0 lowest", () =>
    expect(encodeValue("AB", "string", ctx)).toEqual({ ok: true, raw: 0x4241n }));

  it("scales fixed by 10^8 without floats", () => {
    expect(encodeValue("0.1", "fixed", ctx)).toEqual({ ok: true, raw: 10_000_000n });
    expect(encodeValue("-1", "fixed", ctx)).toEqual({ ok: true, raw: 2n ** 64n - 100_000_000n });
  });

  it("rejects", () => {
    expect(encodeValue("abc", "long", ctx)).toEqual({ ok: false, error: "invalid" });
    expect(encodeValue("18446744073709551616", "unsigned", ctx)).toEqual({ ok: false, error: "outOfRange" });
    expect(encodeValue("9223372036854775808", "long", ctx)).toEqual({ ok: false, error: "outOfRange" });
    expect(encodeValue("123456789", "string", ctx)).toEqual({ ok: false, error: "tooLong" });
    expect(encodeValue("1.123456789", "fixed", ctx)).toEqual({ ok: false, error: "tooManyDecimals" });
    expect(encodeValue("Closed", "enum", ctx)).toEqual({ ok: false, error: "unknownEnum" });
    expect(encodeValue("0x1ffffffffffffffff", "hex", ctx)).toEqual({ ok: false, error: "outOfRange" });
    expect(encodeValue("S-XXXX", "address", ctx)).toEqual({ ok: false, error: "invalid" });
  });

  it("generateDataStack sees unsigned decimals", () => {
    const minusOne = encodeValue("-1", "long", ctx);
    if (!minusOne.ok) throw new Error();
    expect(generateDataStack([toContractData(minusOne.raw), "1"])).toBe("ffffffffffffffff" + "0100000000000000");
  });
});
