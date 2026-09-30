import { describe, expect, it } from "bun:test";
import { enumToLines, parseEnumLines } from "./enum-lines";

describe("enum lines", () => {
  it("round-trips 'value = label' lines", () => {
    const values = { "0": "idle", "-1": "broken" };
    expect(parseEnumLines(enumToLines(values))).toEqual(values);
    expect(parseEnumLines("1 = a\n\n 2=b ")).toEqual({ "1": "a", "2": "b" });
    expect(parseEnumLines("x = a")).toBeNull();
  });
});
