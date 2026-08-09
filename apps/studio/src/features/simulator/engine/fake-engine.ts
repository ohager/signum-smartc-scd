import type { DebugState, SimulatorEngine } from "./engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";

/** Deterministic in-memory engine for testing the controller + UI without the real simulator. */
export class FakeEngine implements SimulatorEngine {
  private lineCount = 1;
  private ptr = 0;
  private steps = 0;
  private finished = false;
  private breakpoints = new Set<number>();

  load(cSource: string, _creatorId?: string): void {
    this.lineCount = Math.max(1, cSource.split("\n").length);
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
  }
  applyScenario(_scenario: ScenarioFile): void {
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
  }
  step(): DebugState {
    if (this.ptr < this.lineCount - 1) {
      this.ptr++;
      this.steps++;
    } else {
      this.finished = true;
    }
    return this.getState();
  }
  stepInto(): DebugState {
    return this.step();
  }
  continue(): DebugState {
    while (this.ptr < this.lineCount - 1) {
      this.ptr++;
      this.steps++;
      if (this.breakpoints.has(this.ptr + 1)) return this.getState();
    }
    this.finished = true;
    return this.getState();
  }
  reset(): DebugState {
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
    return this.getState();
  }
  toggleBreakpoint(sourceLine: number): void {
    if (this.breakpoints.has(sourceLine)) this.breakpoints.delete(sourceLine);
    else this.breakpoints.add(sourceLine);
  }
  getAssembly(): string {
    return "^comment line 1\nFAKE-ASM";
  }
  getState(): DebugState {
    return {
      instructionPointer: this.ptr,
      currentSourceLine: this.ptr + 1,
      memory: { n: String(this.steps), acc: String(this.steps + 1) },
      registers: { A: "0", B: "0" },
      balance: "100_0000_0000",
      emittedTx: [],
      status: this.finished ? "finished" : this.steps === 0 ? "ready" : "running",
      steps: this.steps,
      breakpoints: [...this.breakpoints].sort((a, b) => a - b),
    };
  }
}
