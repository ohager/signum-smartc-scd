import type { SimulatorEngine, DebugState, LedgerState } from "./engine/engine.types";
import type { ScenarioFile } from "./scenario/scenario.types";

/**
 * Orchestrates a debug session over a `SimulatorEngine`: a single `start`
 * (load + apply scenario) plus step/reset relays. The engine already resolves
 * the current source line, so the controller is a thin, engine-agnostic seam
 * the UI depends on (and where breakpoint/continue orchestration will live).
 */
export class DebugController {
  constructor(private readonly engine: SimulatorEngine) {}

  start(cSource: string, scenario: ScenarioFile, creatorId?: string): DebugState {
    this.engine.load(cSource, creatorId ?? scenario.creator);
    this.engine.applyScenario(scenario);
    return this.engine.getState();
  }

  step(): DebugState {
    return this.engine.step();
  }

  stepInto(): DebugState {
    return this.engine.stepInto();
  }

  continue(): DebugState {
    return this.engine.continue();
  }

  forgeNextBlock(): DebugState {
    return this.engine.forgeNextBlock();
  }

  getLedger(): LedgerState {
    return this.engine.getLedger();
  }

  toggleBreakpoint(sourceLine: number): DebugState {
    this.engine.toggleBreakpoint(sourceLine);
    return this.engine.getState();
  }

  reset(): DebugState {
    return this.engine.reset();
  }

  getAssembly(): string {
    return this.engine.getAssembly();
  }
}
