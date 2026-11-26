import { describe, expect, test } from "bun:test";
import { fixture } from "../__fixtures__/load";
import { buildLintContext } from "../lint-context";
import { unboundedLoop } from "./unbounded-loop";

const run = (source: string) => unboundedLoop(buildLintContext(source)).map(({ rule, severity, line }) => ({ rule, severity, line }));
const warn = (line: number) => ({ rule: "unbounded-loop" as const, severity: "warning" as const, line });

describe("unbounded-loop", () => {
  test("fires on unbounded-loop-fires", () => {
    expect(run(fixture("unbounded-loop-fires"))).toEqual([warn(9), warn(12), warn(18)]);
  });

  test("stays quiet on unbounded-loop-quiet", () => {
    expect(run(fixture("unbounded-loop-quiet"))).toEqual([]);
  });

  test("while (1) and while (true) always warn", () => {
    expect(run("void f(void) {\n  while (1) { }\n  while (true) { }\n}")).toEqual([warn(2), warn(3)]);
  });

  test("a bound modified in a body without braces counts", () => {
    expect(run("void f(void) {\n  long i;\n  while (i < 3) i++;\n}")).toEqual([]);
  });

  test("assignment and compound assignment change the bound", () => {
    expect(run("void f(void) {\n  long i, j;\n  while (i != 0) { i = i - 1; }\n  while (j >= 1) { j -= 2; }\n}")).toEqual([]);
  });

  test("== is not a bound", () => {
    expect(run("void f(void) {\n  long i;\n  while (i == 0) { i = 1; }\n}")).toEqual([warn(3)]);
  });

  test("a for loop whose increment changes the bound is bounded", () => {
    expect(run("void f(void) {\n  long i;\n  for (i = 0; i < 4; i += 1) { }\n}")).toEqual([]);
  });

  test("the loop variable only written in the for init does not bound it", () => {
    expect(run("void f(void) {\n  long i;\n  for (i = 0; i < 4; ) { }\n}")).toEqual([warn(3)]);
  });

  test("a do-while is reported at its do line", () => {
    expect(run("void f(void) {\n  long i;\n  do {\n    i++;\n  } while (i < 3);\n  do {\n  } while (i < 3);\n}")).toEqual([warn(6)]);
  });
});
