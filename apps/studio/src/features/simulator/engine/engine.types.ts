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
  currentBlock: number; // current blockchain height (1-based user block)
  memory: Record<string, string>; // variable name -> value
  registers: Record<string, string>;
  balance: string; // NQT as string
  emittedTx: EmittedTx[];
  status: DebugStatus;
  steps: number;
  breakpoints: number[]; // source lines (1-based) that have a breakpoint
  error?: string; // halt/exception reason when the contract aborts
}

export interface LedgerToken {
  asset: string;
  quantity: string;
}

export interface LedgerAccount {
  id: string; // display name (or numeric id)
  balance: string; // NQT string
  tokens: LedgerToken[];
}

export interface LedgerTx {
  block: number; // 1-based display block (engine blockheight + 1)
  txId: string; // transaction id (bigint as string)
  sender: string;
  recipient: string;
  amount: string;
  message?: string;
}

export interface LedgerState {
  currentBlock: number;
  accounts: LedgerAccount[];
  transactions: LedgerTx[];
}

export interface SimulatorEngine {
  load(cSource: string, creatorId?: string): void;
  applyScenario(scenario: ScenarioFile): void;
  step(): DebugState; // one assembly instruction
  stepInto(): DebugState; // step until the C source line changes (source-level)
  continue(): DebugState;
  forgeNextBlock(): DebugState; // forge the next block: deliver its txs + re-activate
  reset(): DebugState;
  toggleBreakpoint(sourceLine: number): void;
  getState(): DebugState;
  getLedger(): LedgerState; // committed chain state (accounts + tx history)
  getAssembly(): string; // assembly listing for the asm view
}
