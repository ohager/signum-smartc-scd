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
});
