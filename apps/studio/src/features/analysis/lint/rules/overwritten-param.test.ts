import { describe, expect, test } from "bun:test";
import { deployParamsFor } from "@/features/deployment/deploy-params";
import { fixture } from "../__fixtures__/load";
import { buildLintContext } from "../lint-context";
import { overwrittenParam } from "./overwritten-param";

const runFull = (source: string, withParams = true) =>
  overwrittenParam(buildLintContext(source, { params: withParams ? deployParamsFor(source, []) : [] }));
const run = (source: string) => runFull(source).map(({ rule, severity, line }) => ({ rule, severity, line }));

describe("overwritten-param", () => {
  test("a TESTBED parameter written by a constructor fires at the top-level call that runs it", () => {
    expect(run(fixture("overwritten-param-fires"))).toEqual([{ rule: "overwritten-param", severity: "warning", line: 11 }]);
  });

  test("names the parameter", () => {
    expect(runFull(fixture("overwritten-param-fires"))[0]!.message).toContain("owner");
  });

  test("a write inside main is not an overwrite", () => {
    expect(run(fixture("overwritten-param-quiet"))).toEqual([]);
  });

  test("without parameters nothing can be overwritten", () => {
    expect(runFull(fixture("overwritten-param-fires"), false)).toEqual([]);
  });

  test("source that does not compile yields nothing", () => {
    expect(runFull(fixture("not-compiling"))).toEqual([]);
  });
});
