import { describe, expect, test } from "bun:test";
import { fixture } from "./__fixtures__/load";
import { buildLintContext } from "./lint-context";

describe("buildLintContext", () => {
  const ctx = buildLintContext(fixture("sender-check-fires"));

  test("strips comments without moving lines", () => {
    const c = buildLintContext("long a; // note\n/* x\ny */ long b;\n");
    expect(c.stripped.split("\n")).toHaveLength(c.lines.length);
    expect(c.stripped).not.toContain("note");
  });

  test("finds function spans with 1-based lines", () => {
    expect(ctx.functions.map((f) => [f.name, f.startLine, f.endLine])).toEqual([
      ["setCount", 7, 9],
      ["main", 11, 24],
    ]);
  });

  test("handlers are functions called from a case plus every case body", () => {
    expect(ctx.handlers.map((h) => [h.name, h.startLine])).toEqual([
      ["setCount", 7],
      ["case 1", 14],
      ["case 2", 17],
      ["default", 20],
    ]);
  });

  test("keeps the label-map params", () => {
    expect(buildLintContext("long a;", { params: [{ index: 0, name: "a" }] }).params).toHaveLength(1);
  });
});
