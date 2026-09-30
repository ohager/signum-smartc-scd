import { describe, expect, it } from "bun:test";
import { flattenMessages, isPluralNode } from "./flatten";

describe("flattenMessages", () => {
  it("joins nested keys with dots and keeps plural objects as leaves", () => {
    const flat = flattenMessages({
      a: { b: "x", c: { one: "1", other: "n" } },
      d: "y",
    });
    expect([...flat.keys()]).toEqual(["a.b", "a.c", "d"]);
    expect(flat.get("a.c")).toEqual({ one: "1", other: "n" });
  });

  it("recognises plural nodes only when every key is a CLDR category and other exists", () => {
    expect(isPluralNode({ one: "a", other: "b" })).toBe(true);
    expect(isPluralNode({ one: "a" })).toBe(false);
    expect(isPluralNode({ one: "a", other: "b", label: "c" })).toBe(false);
    expect(isPluralNode("x")).toBe(false);
  });
});
