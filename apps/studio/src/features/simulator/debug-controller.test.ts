import { describe, it, expect } from "bun:test";
import { DebugController } from "./debug-controller";
import { FakeEngine } from "./engine/fake-engine";
import { defaultScenario } from "./scenario/scenario-io";

describe("DebugController", () => {
  it("start loads the contract, applies the scenario, and returns the initial state", () => {
    const c = new DebugController(new FakeEngine());
    const s = c.start("a\nb\nc", defaultScenario());
    expect(s.steps).toBe(0);
    expect(s.status).toBe("ready");
    expect(s.instructionPointer).toBe(0);
  });

  it("step and stepInto forward to the engine and advance", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb\nc", defaultScenario());
    expect(c.step().steps).toBe(1);
    expect(c.stepInto().steps).toBe(2);
  });

  it("reset returns to the start", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb\nc", defaultScenario());
    c.step();
    expect(c.reset().steps).toBe(0);
  });

  it("exposes the assembly listing from the engine", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb", defaultScenario());
    expect(typeof c.getAssembly()).toBe("string");
  });

  it("toggleBreakpoint returns state with the breakpoint recorded", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb\nc", defaultScenario());
    expect(c.toggleBreakpoint(2).breakpoints).toContain(2);
  });

  it("continue runs to a breakpoint line", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb\nc\nd", defaultScenario());
    c.toggleBreakpoint(3);
    expect(c.continue().currentSourceLine).toBe(3);
  });

  it("forgeNextBlock advances the current block", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb\nc", defaultScenario());
    expect(c.forgeNextBlock().currentBlock).toBe(2);
  });

  it("getLedger returns the engine's ledger", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb\nc", defaultScenario());
    expect(c.getLedger().currentBlock).toBe(1);
  });

  it("start passes scenario.creator to the engine as the creator id", () => {
    const engine = new FakeEngine();
    const c = new DebugController(engine);
    c.start("a\nb\nc", { version: 2, creator: "777", accounts: [], transactions: [] });
    expect(engine.lastCreatorId).toBe("777");
  });
});
