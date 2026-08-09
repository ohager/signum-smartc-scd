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
});
