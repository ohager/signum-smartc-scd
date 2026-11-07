import { describe, expect, test } from "bun:test";
import { fixture } from "../__fixtures__/load";
import { buildLintContext } from "../lint-context";
import { activationBelowGas } from "./activation-below-gas";

const runFull = (source: string) => activationBelowGas(buildLintContext(source));
const run = (source: string) => runFull(source).map(({ rule, severity, line }) => ({ rule, severity, line }));

describe("activation-below-gas", () => {
  test("fires on the #program activationAmount line", () => {
    expect(run(fixture("activation-below-gas-fires"))).toEqual([{ rule: "activation-below-gas", severity: "error", line: 3 }]);
  });

  test("names the worst case, the handler and the amount to set", () => {
    const [f] = runFull(fixture("activation-below-gas-fires"));
    expect(f!.message).toContain("heavy");
    expect(f!.message).toContain("SIGNA");
    expect(f!.hint).toMatch(/#program activationAmount \d+/);
    // Rounded up to 0.01 SIGNA = 1 000 000 planck.
    expect(Number(/activationAmount (\d+)/.exec(f!.hint)![1]) % 1_000_000).toBe(0);
  });

  test("stays quiet when the activation amount covers the worst case", () => {
    expect(run(fixture("activation-below-gas-quiet"))).toEqual([]);
  });

  test("without the directive the error sits on line 1 and asks for one", () => {
    const [f] = runFull(fixture("activation-below-gas-missing"));
    expect({ line: f!.line, severity: f!.severity }).toEqual({ line: 1, severity: "error" });
    expect(f!.message).toContain("No activationAmount set");
    expect(f!.hint).toMatch(/#program activationAmount \d+/);
  });

  test("a lower bound is reported as 'at least', with the missing-switch hint", () => {
    const src = `#program activationAmount 100\nstruct TXINFO { long txId, sender, amount, method; } currentTX;\nlong n;\nvoid main(void) {\n  while ((currentTX.txId = getNextTx()) != 0) {\n    if (currentTX.method == 1) { n = n * 3 + 1; }\n  }\n  for (n = 0; n < 20; n++) { n = n + 0; }\n}`;
    const [f] = runFull(src);
    expect(f!.message).toContain("at least");
    expect(f!.hint).toContain("switch");
  });

  test("an incomplete worst case that is already covered says nothing", () => {
    const src = `#program activationAmount 100_000_000\nstruct TXINFO { long txId, sender, amount, method; } currentTX;\nlong n;\nvoid main(void) {\n  while ((currentTX.txId = getNextTx()) != 0) {\n    if (currentTX.method == 1) { n++; }\n  }\n}`;
    expect(run(src)).toEqual([]);
  });

  test("source that does not compile yields nothing", () => {
    expect(run(fixture("not-compiling"))).toEqual([]);
  });
});
