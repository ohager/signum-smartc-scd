import { describe, it, expect } from "bun:test";
import { diffLines } from "./line-diff";

describe("diffLines", () => {
  it("returns nothing for identical text", () => {
    expect(diffLines("a\nb\nc", "a\nb\nc")).toEqual([]);
  });

  it("marks appended lines as added", () => {
    expect(diffLines("a\nb", "a\nb\nc\nd")).toEqual([{ kind: "added", startLine: 3, endLine: 4, oldText: "" }]);
  });

  it("marks a modified middle line as changed, keeping the old text", () => {
    expect(diffLines("a\nb\nc", "a\nB\nc")).toEqual([{ kind: "changed", startLine: 2, endLine: 2, oldText: "b" }]);
  });

  it("collapses a replaced block of different length into one changed range", () => {
    expect(diffLines("a\nb\nc\nd", "a\nX\nd")).toEqual([{ kind: "changed", startLine: 2, endLine: 2, oldText: "b\nc" }]);
  });

  it("marks a removed block as deleted at the line after which it was removed", () => {
    expect(diffLines("a\nb\nc\nd", "a\nd")).toEqual([{ kind: "deleted", startLine: 1, endLine: 1, oldText: "b\nc" }]);
  });

  it("puts a deletion at the top of the file on line 1", () => {
    expect(diffLines("a\nb", "b")).toEqual([{ kind: "deleted", startLine: 1, endLine: 1, oldText: "a" }]);
  });

  it("reports an emptied file as deleted", () => {
    expect(diffLines("a\nb", "")).toEqual([{ kind: "deleted", startLine: 1, endLine: 1, oldText: "a\nb" }]);
  });

  it("reports a new file (before empty) as one added block", () => {
    expect(diffLines("", "a\nb")).toEqual([{ kind: "added", startLine: 1, endLine: 2, oldText: "" }]);
  });

  it("returns nothing when both sides are empty", () => {
    expect(diffLines("", "")).toEqual([]);
  });

  it("keeps separate hunks separate", () => {
    const out = diffLines("a\nb\nc\nd\ne", "a\nB\nc\nd\ne\nf");
    expect(out.map((c) => [c.kind, c.startLine, c.endLine])).toEqual([["changed", 2, 2], ["added", 6, 6]]);
  });

  it("falls back to one changed block beyond 5000 x 5000 lines", () => {
    const before = Array.from({ length: 5001 }, (_, i) => `x${i}`).join("\n");
    const after = Array.from({ length: 5001 }, (_, i) => `y${i}`).join("\n");
    expect(diffLines(before, after)).toEqual([{ kind: "changed", startLine: 1, endLine: 5001, oldText: before }]);
  });
});
