import type { DebugState, LedgerState, SimulatorEngine } from "./engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";

/** Deterministic in-memory engine for testing the controller + UI without the real simulator. */
export class FakeEngine implements SimulatorEngine {
  private lineCount = 1;
  private ptr = 0;
  private steps = 0;
  private finished = false;
  private block = 0;
  private scenario: ScenarioFile | null = null;
  private breakpoints = new Set<number>();
  lastCreatorId?: string;

  load(cSource: string, creatorId?: string): void {
    this.lastCreatorId = creatorId;
    this.lineCount = Math.max(1, cSource.split("\n").length);
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
    this.block = 0;
  }
  applyScenario(scenario: ScenarioFile): void {
    this.scenario = scenario;
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
    this.block = 1;
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
  forgeNextBlock(): DebugState {
    this.block++;
    this.ptr = 0;
    this.finished = false;
    return this.getState();
  }
  reset(): DebugState {
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
    this.block = this.scenario ? 1 : 0;
    return this.getState();
  }
  toggleBreakpoint(sourceLine: number): void {
    if (this.breakpoints.has(sourceLine)) this.breakpoints.delete(sourceLine);
    else this.breakpoints.add(sourceLine);
  }
  getAssembly(): string {
    return "^comment line 1\nFAKE-ASM";
  }
  getLedger(): LedgerState {
    const accounts = (this.scenario?.accounts ?? []).map((a) => ({
      id: a.id,
      balance: a.balance,
      tokens: [] as { asset: string; quantity: string }[],
    }));
    const transactions = (this.scenario?.transactions ?? [])
      .filter((t) => t.block <= this.block)
      .map((t) => ({
        block: t.block,
        txId: t.txId ?? "",
        sender: t.sender,
        recipient: "contract",
        amount: t.amount,
        ...(t.message ? { message: t.message } : {}),
      }));
    return { currentBlock: this.block, accounts, transactions };
  }
  getState(): DebugState {
    return {
      instructionPointer: this.ptr,
      currentSourceLine: this.ptr + 1,
      currentBlock: this.block,
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
