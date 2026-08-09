import { describe, it, expect } from "bun:test";
import { FakeEngine } from "./fake-engine";
import { defaultScenario } from "../scenario/scenario-io";

describe("FakeEngine", () => {
  it("advances instructionPointer, steps, and source line on step()", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc"); // 3 lines
    e.applyScenario(defaultScenario());
    const s1 = e.step();
    expect(s1.steps).toBe(1);
    expect(s1.instructionPointer).toBe(1);
    expect(s1.currentSourceLine).toBe(2);
  });
  it("reset returns to the start", () => {
    const e = new FakeEngine();
    e.load("a\nb");
    e.applyScenario(defaultScenario());
    e.step();
    const r = e.reset();
    expect(r.steps).toBe(0);
    expect(r.instructionPointer).toBe(0);
    expect(r.status).toBe("ready");
  });
  it("reaches finished at the last line", () => {
    const e = new FakeEngine();
    e.load("a\nb");
    e.applyScenario(defaultScenario());
    e.step();
    expect(e.step().status).toBe("finished");
  });

  it("toggleBreakpoint adds then removes a source line", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.toggleBreakpoint(2);
    expect(e.getState().breakpoints).toContain(2);
    e.toggleBreakpoint(2);
    expect(e.getState().breakpoints).not.toContain(2);
  });

  it("continue runs to the next breakpoint line", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc\nd\ne");
    e.applyScenario(defaultScenario());
    e.toggleBreakpoint(3);
    const s = e.continue();
    expect(s.currentSourceLine).toBe(3);
    expect(s.breakpoints).toContain(3);
  });

  it("continue runs to finished when there is no breakpoint", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.applyScenario(defaultScenario());
    expect(e.continue().status).toBe("finished");
  });
});

describe("FakeEngine — block + ledger", () => {
  it("starts on block 1 after applyScenario", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.applyScenario(defaultScenario());
    expect(e.getState().currentBlock).toBe(1);
  });
  it("forgeNextBlock advances the block and re-arms stepping", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.applyScenario(defaultScenario());
    const s = e.forgeNextBlock();
    expect(s.currentBlock).toBe(2);
    expect(s.status).not.toBe("finished");
  });
  it("getLedger lists accounts and only transactions up to the current block", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.applyScenario({
      version: 2,
      creator: "555",
      accounts: [{ id: "1001", balance: "100" }],
      transactions: [
        { block: 1, sender: "1001", amount: "5" },
        { block: 3, sender: "1002", amount: "0" },
      ],
    });
    const l1 = e.getLedger();
    expect(l1.currentBlock).toBe(1);
    expect(l1.accounts.map((a) => a.id)).toContain("1001");
    expect(l1.transactions.length).toBe(1); // block-3 tx not delivered yet
    e.forgeNextBlock();
    e.forgeNextBlock();
    expect(e.getLedger().transactions.length).toBe(2);
  });
});
