import { describe, expect, it } from "bun:test";
import { Address } from "@signumjs/core";
import { formatKey2, parseKeyInput } from "./map-keys";

const ctx = { prefix: "S" as const, enums: {} };

describe("parseKeyInput", () => {
  it("accepts decimals and converts addresses to signed decimals", () => {
    expect(parseKeyInput("10", undefined)).toEqual({ ok: true, key: "10" });
    expect(parseKeyInput("-5", "long")).toEqual({ ok: true, key: "-5" });
    const rs = Address.fromNumericId("18446744073709551615", "S").getReedSolomonAddress();
    expect(parseKeyInput(rs, "address")).toEqual({ ok: true, key: "-1" });
    expect(parseKeyInput("abc", undefined)).toEqual({ ok: false });
  });
});

describe("formatKey2", () => {
  it("prefers a named key2, then the group's key2 format", () => {
    const group = { key1: "1", name: "g", key2Format: "address" as const,
      key2: [{ key2: "7", name: "special", valueFormat: "bool" as const }] };
    expect(formatKey2("7", group, ctx)).toEqual({ name: "special", key: "7", valueFormat: "bool", enumName: undefined });
    expect(formatKey2("1", group, ctx).key).toBe(Address.fromNumericId("1", "S").getReedSolomonAddress());
    expect(formatKey2("-1", null, ctx)).toEqual({ name: null, key: "-1" });
  });
});
