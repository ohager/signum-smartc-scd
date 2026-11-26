import { describe, expect, test } from "bun:test";
import { fixture } from "../__fixtures__/load";
import { buildLintContext } from "../lint-context";
import { COMPILER_VERSION } from "../types";
import { pragmaVersion } from "./pragma-version";

const run = (source: string) => pragmaVersion(buildLintContext(source)).map(({ rule, severity, line }) => ({ rule, severity, line }));
const info = (line: number) => ({ rule: "pragma-version" as const, severity: "info" as const, line });

describe("pragma-version", () => {
  test("fires on pragma-fires", () => {
    expect(run(fixture("pragma-fires"))).toEqual([info(1), info(1)]);
  });

  test("stays quiet on pragma-quiet", () => {
    expect(run(fixture("pragma-quiet"))).toEqual([]);
  });

  test("reports missing version and missing optimizationLevel", () => {
    const findings = pragmaVersion(buildLintContext("long x;"));
    expect(findings.map((f) => f.line)).toEqual([1, 1]);
    expect(findings[0]!.message).toContain("missing");
  });

  test("the mismatch is reported at the pragma line", () => {
    expect(run("// c\n#pragma version 1.9\n#pragma optimizationLevel 2\n")).toEqual([info(2)]);
  });

  test("a patch difference is fine", () => {
    expect(run(`#pragma version ${COMPILER_VERSION.split(".").slice(0, 2).join(".")}.9\n#pragma optimizationLevel 0\n`)).toEqual([]);
  });

  test("a pragma in a comment is ignored", () => {
    expect(run("// #pragma version 2.3\n#pragma optimizationLevel 2\n")).toHaveLength(1);
  });
});
