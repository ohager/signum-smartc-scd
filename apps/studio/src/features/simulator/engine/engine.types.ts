import type { ScenarioFile } from "../scenario/scenario.types";

export type DebugStatus = "ready" | "running" | "stopped" | "finished" | "error";

export interface EmittedTx {
  recipient: string;
  amount: string; // NQT as string (preserve 64-bit precision)
  message?: string;
}

export interface DebugState {
  instructionPointer: number; // assembly line index (0-based)
  currentSourceLine: number | null; // 1-based C line from the engine's C↔asm map; null if unmapped
  memory: Record<string, string>; // variable name -> value
  registers: Record<string, string>;
  balance: string; // NQT as string
  emittedTx: EmittedTx[];
  status: DebugStatus;
  steps: number;
  breakpoints: number[]; // source lines (1-based) that have a breakpoint
  error?: string; // halt/exception reason when the contract aborts
}

export interface SimulatorEngine {
  load(cSource: string, creatorId?: string): void;
  applyScenario(scenario: ScenarioFile): void;
  step(): DebugState; // one assembly instruction
  stepInto(): DebugState; // step until the C source line changes (source-level)
  continue(): DebugState;
  reset(): DebugState;
  toggleBreakpoint(sourceLine: number): void;
  getState(): DebugState;
  getAssembly(): string; // assembly listing for the asm view
}
