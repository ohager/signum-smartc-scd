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
