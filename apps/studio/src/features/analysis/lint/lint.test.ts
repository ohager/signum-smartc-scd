import { describe, expect, test } from "bun:test";
import { fixture } from "./__fixtures__/load";
import { lintContract } from "./lint";
import { buildLintContext } from "./lint-context";
import { COMPILER_VERSION } from "./types";

describe("lintContract", () => {
  test("non-compiling source runs only rules 5 and 6 and reports compiled:false", () => {
    const result = lintContract(fixture("not-compiling"));
    expect(result.compiled).toBe(false);
    // The fixture has `while (1)` and no pragmas; rule 3 stays silent, rule 6 speaks.
    expect(result.findings.map((f) => f.rule)).toEqual(["pragma-version", "pragma-version"]);
  });

  test("a compiling contract reports compiled:true and every rule's findings", () => {
    const result = lintContract(fixture("sender-check-fires"));
    expect(result.compiled).toBe(true);
    expect(result.findings.map((f) => f.rule)).toEqual(["activation-below-gas", "sender-check", "no-catch", "sender-check"]);
  });

  test("sorts by line, then rule id", () => {
    const src = `long owner, count;
struct TXINFO { long txId, sender, amount, method; } currentTX;
void main(void) {
  while ((currentTX.txId = getNextTx()) != 0) {
    switch (currentTX.method) {
      case 1: count = 1; break;
    }
  }
}`;
    const { findings } = lintContract(src);
    const keys = findings.map((f) => [f.line, f.rule] as const);
    expect(keys).toEqual([...keys].sort((a, b) => a[0] - b[0] || a[1].localeCompare(b[1])));
    expect(findings.map((f) => f.rule)).toEqual(
      expect.arrayContaining(["pragma-version", "switch-no-default", "sender-check"]),
    );
    expect(findings[0]!.line).toBe(1);
  });

  test("every finding has a message and a hint", () => {
    const { findings } = lintContract(fixture("unbounded-loop-fires"));
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) {
      expect(f.message.length).toBeGreaterThan(0);
      expect(f.hint.length).toBeGreaterThan(0);
    }
  });

  test("all compiling fixtures compile", () => {
    for (const name of ["sender-check-fires", "send-without-check-quiet", "unbounded-loop-quiet", "switch-no-default-fires", "pragma-fires"]) {
      expect(buildLintContext(fixture(name)).verbose).not.toBeNull();
    }
    expect(buildLintContext(fixture("not-compiling")).verbose).toBeNull();
  });

  test("COMPILER_VERSION matches the installed compiler", () => {
    expect(COMPILER_VERSION).toBe("2.3.0");
  });
});
