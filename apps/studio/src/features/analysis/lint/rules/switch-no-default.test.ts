import { describe, expect, test } from "bun:test";
import { fixture } from "../__fixtures__/load";
import { buildLintContext } from "../lint-context";
import { switchNoDefault } from "./switch-no-default";

const run = (source: string) => switchNoDefault(buildLintContext(source)).map(({ rule, severity, line }) => ({ rule, severity, line }));

describe("switch-no-default", () => {
  test("fires on switch-no-default-fires", () => {
    expect(run(fixture("switch-no-default-fires"))).toEqual([{ rule: "switch-no-default", severity: "warning", line: 9 }]);
  });

  test("stays quiet on switch-no-default-quiet", () => {
    expect(run(fixture("switch-no-default-quiet"))).toEqual([]);
  });

  test("a switch outside main is not reported", () => {
    expect(run("long x;\nvoid helper(void) { switch (x) { case 1: break; } }\nvoid main(void) { }")).toEqual([]);
  });

  test("a default in a comment does not count", () => {
    const src = "long x;\nvoid main(void) {\n  switch (x) {\n    case 1: break;\n    // default: break;\n  }\n}";
    expect(run(src)).toHaveLength(1);
  });
});
