import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { deployParamsFor } from "@/features/deployment/deploy-params";
import { lintContract } from "./lint";

/**
 * Calibration: the repo's real contracts, linted as a SmartC author's code.
 * Every finding in the snapshot has been read against its source and judged
 * correct; a rule that starts reporting something new here must be looked at
 * again, not just accepted.
 */
const EXAMPLES = join(import.meta.dir, "../../../../../../examples");

const files = readdirSync(EXAMPLES).filter((f) => f.endsWith(".smart.c")).sort();

describe("lint over examples/", () => {
  test("there are examples to lint", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  test("findings per example", () => {
    const triples = files.flatMap((file) => {
      const source = readFileSync(join(EXAMPLES, file), "utf8");
      const { compiled, findings } = lintContract(source, { params: deployParamsFor(source, []) });
      expect({ file, compiled }).toEqual({ file, compiled: true });
      return findings.map((f) => ({ file, rule: f.rule, line: f.line }));
    });
    expect(triples).toMatchSnapshot();
  });
});
