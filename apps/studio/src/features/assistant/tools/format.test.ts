import { describe, it, expect } from "bun:test";
import { numberLines, truncate, MAX_READ_LINES } from "./format";

describe("numberLines", () => {
  it("right-aligns the number to five columns", () => {
    expect(numberLines("a\nb\nc", 1, 3)).toBe("    1| a\n    2| b\n    3| c");
  });
  it("numbers by absolute position for a sub-range", () => {
    expect(numberLines("a\nb\nc", 2, 3)).toBe("    2| b\n    3| c");
  });
  it("clamps past the end and is empty when from > to", () => {
    expect(numberLines("a\nb", 2, 99)).toBe("    2| b");
    expect(numberLines("a\nb", 3, 2)).toBe("");
  });
});

describe("truncate", () => {
  it("leaves short text alone", () => {
    expect(truncate("abc", 3)).toEqual({ text: "abc", truncated: false });
  });
  it("cuts long text and marks it", () => {
    expect(truncate("abcdef", 3)).toEqual({ text: "abc", truncated: true });
  });
});

it("caps reads at 2000 lines", () => expect(MAX_READ_LINES).toBe(2000));
