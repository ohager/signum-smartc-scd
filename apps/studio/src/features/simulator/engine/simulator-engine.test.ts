import { describe, it, expect } from "bun:test";
import { ScSimulatorEngine } from "./simulator-engine";
import { defaultScenario } from "../scenario/scenario-io";

const CONTRACT = "#pragma maxAuxVars 2\nlong n, acc;\nvoid main() { n = 3; acc = n + 1; }";

describe("ScSimulatorEngine (real smartc-signum-simulator)", () => {
  it("loads C, applies scenario, and steps with advancing state", () => {
    const e = new ScSimulatorEngine();
    e.load(CONTRACT);
    e.applyScenario(defaultScenario());
    const before = e.getState();
    const after = e.step();
    expect(after.steps).toBe(before.steps + 1);
    expect(typeof after.instructionPointer).toBe("number");
  });

  it("exposes contract variable 'n' = 3 after running", () => {
    const e = new ScSimulatorEngine();
    e.load(CONTRACT);
    e.applyScenario(defaultScenario());
    for (let i = 0; i < 50 && e.getState().status !== "finished"; i++) e.stepInto();
    const s = e.getState();
    expect(Object.keys(s.memory)).toContain("n");
    expect(s.memory.n).toBe("3");
  });

  it("reaches a terminal status", () => {
    const e = new ScSimulatorEngine();
    e.load(CONTRACT);
    e.applyScenario(defaultScenario());
    let s = e.getState();
    for (let i = 0; i < 200 && !["finished", "stopped", "error"].includes(s.status); i++) s = e.stepInto();
    expect(["finished", "stopped", "error"]).toContain(s.status);
  });

  const MULTILINE = [
    "#pragma maxAuxVars 2",
    "long n, acc;",
    "void main() {",
    "  n = 3;",
    "  acc = n + 1;",
    "}",
  ].join("\n");
  const BP_LINE = 5;

  it("toggleBreakpoint records the line in state", () => {
    const e = new ScSimulatorEngine();
    e.load(MULTILINE);
    e.applyScenario(defaultScenario());
    e.toggleBreakpoint(BP_LINE);
    expect(e.getState().breakpoints).toContain(BP_LINE);
  });

  it("continue stops at a breakpoint", () => {
    const e = new ScSimulatorEngine();
    e.load(MULTILINE);
    e.applyScenario(defaultScenario());
    e.toggleBreakpoint(BP_LINE);
    const s = e.continue();
    expect(s.currentSourceLine).toBe(BP_LINE);
  });
});

describe("ScSimulatorEngine — block + ledger", () => {
  const C = "#pragma maxAuxVars 2\nlong n, acc;\nvoid main() { n = 3; acc = n + 1; }";

  it("reports currentBlock 1 after applying a scenario", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario(defaultScenario());
    expect(e.getState().currentBlock).toBe(1);
  });

  it("forgeNextBlock advances currentBlock", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario(defaultScenario());
    expect(e.forgeNextBlock().currentBlock).toBe(2);
  });

  it("getLedger lists the contract account and the activation tx", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario(defaultScenario());
    const l = e.getLedger();
    expect(l.currentBlock).toBe(1);
    expect(l.accounts.some((a) => a.id === "contract")).toBe(true);
    expect(l.transactions.length).toBeGreaterThan(0);
  });
});

describe("ScSimulatorEngine — scenario application", () => {
  const C = "#pragma maxAuxVars 2\nlong n, acc;\nvoid main() { n = 3; acc = n + 1; }";

  it("pre-funds a sender so its balance is not negative after activation", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario({
      version: 2,
      creator: "555",
      accounts: [{ id: "1001", balance: "100_0000_0000" }],
      transactions: [{ block: 1, sender: "1001", amount: "5_0000_0000" }],
    });
    const alice = e.getLedger().accounts.find((a) => a.id === "1001");
    expect(alice).toBeDefined();
    expect(BigInt(alice!.balance)).toBe(9500000000n); // 100e8 - 5e8, not negative
  });

  it("delivers a transaction scheduled for a later block only after forging to it", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario({
      version: 2,
      creator: "555",
      accounts: [{ id: "1001", balance: "100_0000_0000" }],
      transactions: [
        { block: 1, sender: "1001", amount: "5_0000_0000" },
        { block: 3, sender: "1001", amount: "1_0000_0000", message: "later" },
      ],
    });
    expect(e.getLedger().transactions.some((t) => t.block === 3)).toBe(false);
    e.forgeNextBlock(); // -> block 2
    e.forgeNextBlock(); // -> block 3, delivers the block-3 tx
    expect(e.getLedger().transactions.some((t) => t.block === 3)).toBe(true);
  });

  it("accepts a numeric creator and honours a self-defined txId in the ledger", () => {
    const e = new ScSimulatorEngine();
    e.load(C, "555");
    e.applyScenario({
      version: 2,
      creator: "555",
      accounts: [{ id: "1001", balance: "100_0000_0000" }],
      transactions: [{ block: 1, sender: "1001", amount: "5_0000_0000", txId: "1234567890" }],
    });
    expect(e.getLedger().transactions.some((t) => t.txId === "1234567890")).toBe(true);
  });
});
