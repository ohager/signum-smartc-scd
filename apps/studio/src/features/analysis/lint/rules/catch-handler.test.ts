import { describe, expect, test } from "bun:test";
import { fixture } from "../__fixtures__/load";
import { buildLintContext } from "../lint-context";
import { catchRecurringFault, noCatch } from "./catch-handler";

const keys = (findings: ReturnType<typeof noCatch>) => findings.map(({ rule, severity, line }) => ({ rule, severity, line }));
const missing = (source: string) => keys(noCatch(buildLintContext(source)));
const recurring = (source: string) => keys(catchRecurringFault(buildLintContext(source)));

describe("no-catch", () => {
  test("info when there is no catch and nothing is sent", () => {
    expect(missing(fixture("no-catch-fires"))).toEqual([{ rule: "no-catch", severity: "info", line: 7 }]);
  });

  test("warning when the contract sends funds", () => {
    expect(missing(fixture("no-catch-sends-fires"))).toEqual([{ rule: "no-catch", severity: "warning", line: 6 }]);
  });

  test("quiet with a resuming catch", () => {
    expect(missing(fixture("catch-resume-quiet"))).toEqual([]);
  });

  test("quiet with a winding-down catch", () => {
    expect(missing(fixture("catch-wind-down-quiet"))).toEqual([]);
  });

  test("the hint offers both strategies verbatim", () => {
    const [f] = noCatch(buildLintContext(fixture("no-catch-fires")));
    expect(f!.hint).toContain("void catch() { asm { JMP :__fn_main } }");
    expect(f!.hint).toContain("void catch() { sendBalance(getCreator()); exit; }");
  });

  test("source that does not compile yields nothing", () => {
    expect(missing(fixture("not-compiling"))).toEqual([]);
  });
});

describe("catch-recurring-fault", () => {
  test("resume plus a division after the loop fires at that line", () => {
    expect(recurring(fixture("catch-resume"))).toEqual([{ rule: "catch-recurring-fault", severity: "warning", line: 15 }]);
  });

  test("resume with only constant-divisor division in the loop is quiet", () => {
    expect(recurring(fixture("catch-resume-quiet"))).toEqual([]);
  });

  test("winding down is quiet even with a division after the loop", () => {
    expect(recurring(fixture("catch-wind-down-quiet"))).toEqual([]);
  });

  test("no catch at all is not this rule's business", () => {
    expect(recurring(fixture("no-catch-fires"))).toEqual([]);
  });

  test("code before the loop, in main, recurs too", () => {
    const src = `long a, b;\nstruct TXINFO { long txId; } tx;\nvoid catch() { asm { JMP :__fn_main } }\nvoid main(void) {\n  a = a % b;\n  while ((tx.txId = getNextTx()) != 0) { a++; }\n}`;
    expect(recurring(src)).toEqual([{ rule: "catch-recurring-fault", severity: "warning", line: 5 }]);
  });

  test("a call into a recursive function after the loop fires", () => {
    const src = `long a;\nstruct TXINFO { long txId; } tx;\nlong fact(long n) { if (n < 2) return 1; return n * fact(n - 1); }\nvoid catch() { asm { JMP :__fn_main } }\nvoid main(void) {\n  while ((tx.txId = getNextTx()) != 0) { a++; }\n  a = fact(a);\n}`;
    expect(recurring(src)).toEqual([{ rule: "catch-recurring-fault", severity: "warning", line: 7 }]);
  });

  test("a non-recursive call after the loop is quiet", () => {
    const src = `long a;\nstruct TXINFO { long txId; } tx;\nvoid bump(void) { a++; }\nvoid catch() { asm { JMP :__fn_main } }\nvoid main(void) {\n  while ((tx.txId = getNextTx()) != 0) { a++; }\n  bump();\n}`;
    expect(recurring(src)).toEqual([]);
  });

  test("initialiser code runs once and does not recur", () => {
    const src = `long a, d;\nlong q = 100 / 7;\nstruct TXINFO { long txId; } tx;\nvoid catch() { asm { JMP :__fn_main } }\nvoid main(void) {\n  while ((tx.txId = getNextTx()) != 0) { a++; }\n}`;
    expect(recurring(src)).toEqual([]);
  });

  test("the message says the fault recurs", () => {
    const [f] = catchRecurringFault(buildLintContext(fixture("catch-resume")));
    expect(f!.message).toContain("recurs on every activation");
  });
});
