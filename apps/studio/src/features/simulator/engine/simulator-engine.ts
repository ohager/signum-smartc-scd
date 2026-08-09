import { SimNode, Constants, type CONTRACT } from "smartc-signum-simulator";
import type { DebugState, DebugStatus, EmittedTx, SimulatorEngine } from "./engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";
import { toEngineTxs } from "../scenario/to-engine-txs";

type ContractDump = ReturnType<CONTRACT["dumpContractData"]>;

/** Real engine adapter driving deleterium's `smartc-signum-simulator` (SimNode). */
export class ScSimulatorEngine implements SimulatorEngine {
  private node: SimNode | null = null;
  private contractId: bigint | null = null;
  private cSource = "";
  private creatorId: bigint = Constants.creatorID;
  private scenario: ScenarioFile | null = null;
  private steps = 0;
  private accountIds = new Map<string, bigint>();
  private nextAccountId = 1000n;
  private breakpointLines = new Set<number>();

  load(cSource: string, creatorId?: string): void {
    this.cSource = cSource;
    if (creatorId) this.creatorId = BigInt(creatorId);
    this.init();
  }

  applyScenario(scenario: ScenarioFile): void {
    this.scenario = scenario;
    this.submitScenario();
  }

  private init(): void {
    this.node = new SimNode();
    const contract = this.node.loadSmartContract(this.cSource, this.creatorId);
    this.contractId = contract ? contract.contract : null;
    this.steps = 0;
    if (this.scenario) this.submitScenario();
    for (const line of this.breakpointLines) this.node.Simulator.toggleBreakpoint(line);
  }

  private idFor(name: string): bigint {
    if (/^\d+$/.test(name)) return BigInt(name);
    let id = this.accountIds.get(name);
    if (id === undefined) {
      id = this.nextAccountId;
      this.nextAccountId += 1n;
      this.accountIds.set(name, id);
    }
    return id;
  }

  private submitScenario(): void {
    if (!this.node || !this.scenario || this.contractId === null) return;
    // Activation txs are submitted at blockheight 0 (the chain's current
    // height before forging); one forgeBlock() then activates the contract.
    const txs = toEngineTxs(this.scenario, String(this.contractId)).map((t) => ({
      sender: String(this.idFor(t.sender)),
      recipient: String(this.contractId),
      amount: t.amount.replace(/_/g, ""),
      blockheight: t.blockheight,
      ...(t.message ? { messageText: t.message } : {}),
    }));
    this.node.setScenario(JSON.stringify(txs));
    this.node.forgeBlock();
  }

  step(): DebugState {
    this.currentContract()?.step();
    this.steps++;
    return this.getState();
  }

  stepInto(): DebugState {
    this.node?.Simulator.stepIntoSlotContract();
    this.steps++;
    return this.getState();
  }

  continue(): DebugState {
    this.node?.Simulator.runSlotContract();
    return this.getState();
  }

  toggleBreakpoint(sourceLine: number): void {
    if (!this.node) return;
    const result = this.node.Simulator.toggleBreakpoint(sourceLine);
    const r = typeof result === "string" ? result.toUpperCase() : "";
    if (r.includes("ADDED")) this.breakpointLines.add(sourceLine);
    else if (r.includes("REMOVED")) this.breakpointLines.delete(sourceLine);
    // an error like "Line N is not an instruction" leaves the set unchanged
  }

  reset(): DebugState {
    this.init();
    return this.getState();
  }

  getAssembly(): string {
    return (this.dump()?.asmCodeArr ?? []).join("\n");
  }

  getState(): DebugState {
    const d = this.dump();
    if (!d) {
      return {
        instructionPointer: 0,
        currentSourceLine: null,
        memory: {},
        registers: {},
        balance: "0",
        emittedTx: [],
        status: "ready",
        steps: this.steps,
        breakpoints: [...this.breakpointLines].sort((a, b) => a - b),
        error: undefined,
      };
    }
    const currentSourceLine = Array.isArray(d.cToAsmMap) ? (d.cToAsmMap[d.instructionPointer] ?? null) : null;
    const memory: Record<string, string> = {};
    for (const m of d.Memory ?? []) memory[m.varName] = String(m.value);
    const registers: Record<string, string> = {};
    (d.A ?? []).forEach((v, i) => (registers[`A${i + 1}`] = String(v)));
    (d.B ?? []).forEach((v, i) => (registers[`B${i + 1}`] = String(v)));
    const emittedTx: EmittedTx[] = (d.enqueuedTX ?? []).map((tx) => ({
      recipient: String(tx.recipient),
      amount: String(tx.amount),
      message: tx.messageText,
    }));
    const dump = d as any;
    const error = dump.exception || (dump.ERR != null ? `ERR ${dump.ERR}` : undefined);
    return {
      instructionPointer: d.instructionPointer,
      currentSourceLine: currentSourceLine === null ? null : Number(currentSourceLine),
      memory,
      registers,
      balance: String(d.balance),
      emittedTx,
      status: this.statusOf(d),
      steps: this.steps,
      breakpoints: [...this.breakpointLines].sort((a, b) => a - b),
      error,
    };
  }

  private statusOf(d: ContractDump): DebugStatus {
    if (d.dead || d.ERR) return "error";
    if (d.finished) return "finished";
    if (d.frozen || d.stopped) return "stopped";
    if (d.running) return "running";
    return "ready";
  }

  private currentContract(): CONTRACT | undefined {
    return this.node?.Simulator.getCurrentSlotContract();
  }

  private dump(): ContractDump | null {
    const c = this.currentContract();
    return c ? c.dumpContractData() : null;
  }
}
