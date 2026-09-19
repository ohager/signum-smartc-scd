import { describe, it, expect } from "bun:test";
import { compileCell, testCell, simulateCell, deployCell } from "./rail-cells";

describe("compileCell", () => {
  it("says nothing when no compile has happened", () => {
    expect(compileCell(undefined, 500)).toEqual({ fact: "—", tone: "neutral" });
  });

  it("reports a clean compile", () => {
    expect(compileCell({ sourceModified: 500, errorCount: 0 }, 500)).toEqual({
      fact: "compiles",
      tone: "good",
    });
  });

  it("reports the error count", () => {
    expect(compileCell({ sourceModified: 500, errorCount: 1 }, 500)).toEqual({
      fact: "1 error",
      tone: "bad",
    });
    expect(compileCell({ sourceModified: 500, errorCount: 3 }, 500).fact).toBe("3 errors");
  });

  it("refuses a verdict from before the last edit", () => {
    // The one way a status rail can actively mislead.
    expect(compileCell({ sourceModified: 400, errorCount: 0 }, 500)).toEqual({
      fact: "—",
      tone: "neutral",
    });
  });
});

describe("testCell", () => {
  const fresh = { sourceModified: 10, contractModified: 5, passed: 12, failed: 0 };

  it("says so when the project has no test file at all", () => {
    expect(testCell(null, undefined, 5)).toEqual({ fact: "no tests", tone: "neutral" });
  });

  it("says nothing when a test file exists but has never run", () => {
    expect(testCell({ modified: 10 }, undefined, 5)).toEqual({ fact: "—", tone: "neutral" });
  });

  it("reports a green run", () => {
    expect(testCell({ modified: 10 }, fresh, 5)).toEqual({ fact: "12 green", tone: "good" });
  });

  it("reports failures, which are what you want to see first", () => {
    expect(testCell({ modified: 10 }, { ...fresh, passed: 10, failed: 2 }, 5)).toEqual({
      fact: "2 failed",
      tone: "bad",
    });
  });

  it("refuses a verdict from before the test file changed", () => {
    expect(testCell({ modified: 11 }, fresh, 5).fact).toBe("—");
  });

  it("refuses a verdict from before the contract changed", () => {
    // A test result depends on both files, which is why both timestamps are kept.
    expect(testCell({ modified: 10 }, fresh, 6).fact).toBe("—");
  });
});

describe("simulateCell", () => {
  it("counts the scenarios, because that is answerable live", () => {
    expect(simulateCell(3)).toEqual({ fact: "3 scenarios", tone: "neutral" });
    expect(simulateCell(1)).toEqual({ fact: "1 scenario", tone: "neutral" });
    expect(simulateCell(0)).toEqual({ fact: "no scenario", tone: "neutral" });
  });
});

describe("deployCell", () => {
  it("says nothing without a wallet, and explains itself", () => {
    expect(deployCell({ state: "no-wallet" })).toEqual({
      fact: "—",
      tone: "neutral",
      hint: "Connect a wallet to ask the chain",
    });
  });

  it("says nothing while asking", () => {
    expect(deployCell({ state: "asking" })).toEqual({ fact: "…", tone: "neutral" });
  });

  it("says nothing when there is no code to ask about", () => {
    // No machine code hash without a compile, so there is no question to put
    // to the chain — and the previous answer, about different code, must not
    // stay on screen.
    expect(deployCell({ state: "no-code" })).toEqual({
      fact: "—",
      tone: "neutral",
      hint: "The contract does not compile yet",
    });
  });

  it("reports that this code is nowhere on chain", () => {
    expect(deployCell({ state: "answered", total: 0, mine: 0, capped: false })).toEqual({
      fact: "not deployed",
      tone: "neutral",
    });
  });

  it("reports the count, which is the useful part", () => {
    expect(deployCell({ state: "answered", total: 3, mine: 0, capped: false }).fact).toBe("3 deployed");
  });

  it("names how many are yours when the wallet created some", () => {
    expect(deployCell({ state: "answered", total: 3, mine: 1, capped: false }).fact).toBe("3 · 1 yours");
  });

  it("caps a large answer rather than lying about the total", () => {
    // The node API returns no total, so ten results mean "at least ten".
    expect(deployCell({ state: "answered", total: 10, mine: 0, capped: true }).fact).toBe("9+ deployed");
  });
});
