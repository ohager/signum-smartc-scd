# Scenario v2 + Ledger / Debug-Context Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the debugger actually apply a scenario (pre-fund accounts, wire the creator, deliver transactions block-by-block) and surface a Ledger / Debug-Context (accounts with balances + tokens, transaction history).

**Architecture:** Rework the scenario schema to v2 (`accounts` + absolute-`block` `transactions`). Fix the `ScSimulatorEngine` adapter so it pre-seeds balances before forging, wires `creator`, and exposes per-block forging (`forgeNextBlock`) plus a `getLedger()` reader over `smartc-signum-simulator`'s `Blockchain`. Add a Ledger tab to the bottom dock and a "Forge Next Block" control + block indicator to the toolbar. The `SimulatorEngine` interface seam keeps UI/controller testable against `FakeEngine`.

**Tech Stack:** Bun + `bun:test`, React 19, `@monaco-editor/react`, `smartc-signum-simulator@3.1.0`, JSON5.

**Working directory:** `apps/studio` (all paths below are relative to it). Branch: `development`.

**Test/build commands:**
- Logic tests: `bun test src/features/simulator`
- App transpile (UI gate): `bun run build`
- Targeted typecheck (best-effort): `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/simulator"` — **known pre-existing** false-positives are the monaco `IStandaloneCodeEditor` "not assignable" errors in `asm-view.tsx` and `debug-view.tsx` (duplicate monaco install). Any *other* simulator error is real.

---

## File Structure

**Modify:**
- `src/features/simulator/scenario/scenario.types.ts` — v2 types (`ScenarioTx`, `ScenarioAccount`, `ScenarioFile`).
- `src/features/simulator/scenario/scenario-io.ts` — v2 `defaultScenario`/`validateScenario`/`parseScenario`/`serializeScenario`.
- `src/features/simulator/scenario/scenario-io.test.ts` — v2 tests.
- `src/features/simulator/scenario/to-engine-txs.ts` — v2 mapping (`block → blockheight = block-1`).
- `src/features/simulator/scenario/to-engine-txs.test.ts` — v2 tests.
- `src/features/simulator/engine/engine.types.ts` — `DebugState.currentBlock`, `Ledger*` types, `forgeNextBlock`/`getLedger` on the interface.
- `src/features/simulator/engine/fake-engine.ts` — implement new interface members + block/ledger; record `lastCreatorId`.
- `src/features/simulator/engine/fake-engine.test.ts` — new behavior.
- `src/features/simulator/engine/simulator-engine.ts` — pre-fund accounts, wire creator, `forgeNextBlock`, `getLedger`, `nameFor`, `currentBlock`.
- `src/features/simulator/engine/simulator-engine.test.ts` — real-engine ledger/forge/pre-fund/creator tests.
- `src/features/simulator/debug-controller.ts` — `forgeNextBlock`/`getLedger` relays; `start` defaults creator to `scenario.creator`.
- `src/features/simulator/debug-controller.test.ts` — relay + creator-wiring tests.
- `src/features/simulator/ui/bottom-dock.tsx` — Ledger tab + `ledger` prop.
- `src/features/simulator/ui/debug-toolbar.tsx` — "⛏ Next Block" button + block indicator.
- `src/features/simulator/ui/debug-view.tsx` — hold + refresh `ledger`, wire forge/reset, pass `ledger` to dock.

No new files.

---

### Task 1: Scenario v2 pure layer (types + io + tx-mapping)

**Files:**
- Modify: `src/features/simulator/scenario/scenario.types.ts`
- Modify: `src/features/simulator/scenario/scenario-io.ts`
- Modify: `src/features/simulator/scenario/scenario-io.test.ts`
- Modify: `src/features/simulator/scenario/to-engine-txs.ts`
- Modify: `src/features/simulator/scenario/to-engine-txs.test.ts`
- Modify: `src/features/simulator/engine/simulator-engine.ts` (call-site only)

- [ ] **Step 1: Rewrite the scenario-io tests for v2**

Replace the entire contents of `src/features/simulator/scenario/scenario-io.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { parseScenario, serializeScenario, validateScenario, defaultScenario } from "./scenario-io";

describe("scenario-io (v2)", () => {
  it("defaultScenario round-trips through serialize/parse", () => {
    const s = defaultScenario();
    expect(parseScenario(serializeScenario(s))).toEqual(s);
  });
  it("validateScenario accepts the default", () => {
    expect(validateScenario(defaultScenario()).valid).toBe(true);
  });
  it("rejects a non-2 version (old v1 files fall through)", () => {
    const r = validateScenario({ version: 1, contract: {}, accounts: [], timeline: [] });
    expect(r.valid).toBe(false);
  });
  it("rejects a missing creator", () => {
    expect(validateScenario({ version: 2, accounts: [], transactions: [] }).valid).toBe(false);
  });
  it("rejects a non-numeric account id", () => {
    const bad = { version: 2, creator: "555", accounts: [{ id: "alice", balance: "100" }], transactions: [] };
    expect(validateScenario(bad).valid).toBe(false);
  });
  it("rejects a non-numeric creator", () => {
    expect(validateScenario({ version: 2, creator: "boss", accounts: [], transactions: [] }).valid).toBe(false);
  });
  it("rejects a transaction with block < 1", () => {
    const bad = { version: 2, creator: "555", accounts: [], transactions: [{ block: 0, sender: "1001", amount: "1" }] };
    expect(validateScenario(bad).valid).toBe(false);
  });
  it("accepts an optional numeric txId", () => {
    const ok = { version: 2, creator: "555", accounts: [], transactions: [{ block: 1, sender: "1001", amount: "1", txId: "42" }] };
    expect(validateScenario(ok).valid).toBe(true);
  });
  it("parseScenario throws on invalid JSON", () => {
    expect(() => parseScenario("{ not json")).toThrow();
  });
  it("accepts JSON5 (comments, trailing commas, unquoted keys)", () => {
    const src = `{
      // activation
      version: 2,
      creator: "555",
      accounts: [ { id: "1001", balance: "100", }, ],
      transactions: [ { block: 1, sender: "1001", amount: "5" }, ],
    }`;
    const s = parseScenario(src);
    expect(s.version).toBe(2);
    expect(s.transactions.length).toBe(1);
  });
});
```

- [ ] **Step 2: Rewrite the to-engine-txs tests for v2**

Replace the entire contents of `src/features/simulator/scenario/to-engine-txs.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { toEngineTxs } from "./to-engine-txs";
import type { ScenarioFile } from "./scenario.types";

const scenario: ScenarioFile = {
  version: 2,
  creator: "555",
  accounts: [],
  transactions: [
    { block: 1, sender: "1001", amount: "5" },
    { block: 3, sender: "1002", amount: "3", txId: "77", message: "hi" },
  ],
};

describe("toEngineTxs (v2)", () => {
  it("maps block N to engine blockheight N-1, stamps the contract recipient, and passes txId", () => {
    expect(toEngineTxs(scenario, "999")).toEqual([
      { sender: "1001", recipient: "999", amount: "5", blockheight: 0 },
      { sender: "1002", recipient: "999", amount: "3", blockheight: 2, txId: "77", message: "hi" },
    ]);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun test src/features/simulator/scenario`
Expected: FAIL (type/shape mismatches — `ScenarioFile` still v1, `toEngineTxs` still takes `startHeight`).

- [ ] **Step 4: Rewrite the scenario types (v2)**

Replace the entire contents of `src/features/simulator/scenario/scenario.types.ts`:

```ts
export interface ScenarioTx {
  block: number; // 1-based; block 1 = first forged (activation) block
  sender: string; // numeric account id (bigint as string; "_" allowed)
  amount: string; // NQT string; "_" separators allowed
  txId?: string; // optional self-defined tx id (bigint as string); random if omitted
  message?: string; // → messageText
}

export interface ScenarioAccount {
  id: string; // numeric account id (bigint as string; "_" allowed)
  balance: string; // NQT string; "_" separators allowed
}

export interface ScenarioFile {
  version: 2;
  creator: string; // numeric account id (bigint as string)
  accounts: ScenarioAccount[];
  transactions: ScenarioTx[];
}
```

- [ ] **Step 5: Rewrite scenario-io (v2)**

Replace the entire contents of `src/features/simulator/scenario/scenario-io.ts`:

```ts
import JSON5 from "json5";
import type { ScenarioFile } from "./scenario.types";

export function defaultScenario(): ScenarioFile {
  return {
    version: 2,
    creator: "555",
    accounts: [{ id: "1001", balance: "100_0000_0000" }],
    transactions: [{ block: 1, sender: "1001", amount: "5_0000_0000", message: "activate" }],
  };
}

export type ValidationResult =
  | { valid: true; scenario: ScenarioFile }
  | { valid: false; errors: string[] };

// numeric bigint string: digits + optional "_" separators, at least one digit
const isNum = (v: unknown): v is string => typeof v === "string" && /^[0-9_]+$/.test(v) && /[0-9]/.test(v);

export function validateScenario(value: unknown): ValidationResult {
  const errors: string[] = [];
  const v = value as any;
  if (!v || typeof v !== "object") return { valid: false, errors: ["not an object"] };
  if (v.version !== 2) errors.push("version must be 2");
  if (!isNum(v.creator)) errors.push("creator must be a numeric account id");
  if (!Array.isArray(v.accounts)) errors.push("accounts must be an array");
  else
    v.accounts.forEach((a: any, i: number) => {
      if (!isNum(a?.id) || !isNum(a?.balance)) errors.push(`accounts[${i}] needs numeric id and balance`);
    });
  if (!Array.isArray(v.transactions)) errors.push("transactions must be an array");
  else
    v.transactions.forEach((t: any, i: number) => {
      if (typeof t?.block !== "number" || !Number.isInteger(t.block) || t.block < 1)
        errors.push(`transactions[${i}] needs an integer block >= 1`);
      if (!isNum(t?.sender) || !isNum(t?.amount)) errors.push(`transactions[${i}] needs numeric sender and amount`);
      if (t?.txId !== undefined && !isNum(t.txId)) errors.push(`transactions[${i}] txId must be numeric`);
      if (t?.message !== undefined && typeof t.message !== "string") errors.push(`transactions[${i}] message must be a string`);
    });
  return errors.length ? { valid: false, errors } : { valid: true, scenario: value as ScenarioFile };
}

export function parseScenario(json: string): ScenarioFile {
  const parsed = JSON5.parse(json); // JSON5: comments, trailing commas, unquoted keys
  const r = validateScenario(parsed);
  if (!r.valid) throw new Error("Invalid scenario: " + r.errors.join("; "));
  return r.scenario;
}

export function serializeScenario(scenario: ScenarioFile): string {
  return JSON.stringify(scenario, null, 2);
}
```

- [ ] **Step 6: Rewrite to-engine-txs (v2)**

Replace the entire contents of `src/features/simulator/scenario/to-engine-txs.ts`:

```ts
import type { ScenarioFile } from "./scenario.types";

export interface EngineTx {
  sender: string;
  recipient: string;
  amount: string;
  blockheight: number; // engine height = scenario block - 1
  txId?: string;
  message?: string;
}

/**
 * Maps a v2 scenario's transactions to engine txs. A 1-based `block` maps to the
 * engine's 0-based `blockheight` (block 1 = first forged block = height 0).
 */
export function toEngineTxs(scenario: ScenarioFile, contractId: string): EngineTx[] {
  return scenario.transactions.map((tx) => {
    const t: EngineTx = {
      sender: tx.sender,
      recipient: contractId,
      amount: tx.amount,
      blockheight: tx.block - 1,
    };
    if (tx.txId !== undefined) t.txId = tx.txId;
    if (tx.message !== undefined) t.message = tx.message;
    return t;
  });
}
```

- [ ] **Step 7: Fix the adapter call site**

In `src/features/simulator/engine/simulator-engine.ts`, change the `toEngineTxs` call in `submitScenario` (drop the `, 0` argument):

```ts
    const txs = toEngineTxs(this.scenario, String(this.contractId)).map((t) => ({
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `bun test src/features/simulator`
Expected: PASS (all files, including the unchanged real-engine tests that use `defaultScenario()`).

- [ ] **Step 9: Commit**

```bash
git add src/features/simulator/scenario src/features/simulator/engine/simulator-engine.ts
git commit -m "feat(sim): scenario v2 schema (accounts + absolute-block transactions)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Engine interface + FakeEngine + controller relays + adapter read methods

**Files:**
- Modify: `src/features/simulator/engine/engine.types.ts`
- Modify: `src/features/simulator/engine/fake-engine.ts`
- Modify: `src/features/simulator/engine/fake-engine.test.ts`
- Modify: `src/features/simulator/engine/simulator-engine.ts`
- Modify: `src/features/simulator/engine/simulator-engine.test.ts`
- Modify: `src/features/simulator/debug-controller.ts`
- Modify: `src/features/simulator/debug-controller.test.ts`

- [ ] **Step 1: Write failing FakeEngine tests**

Append these tests to `src/features/simulator/engine/fake-engine.test.ts` (inside its top-level `describe`, or add a new `describe`):

```ts
import { describe, it, expect } from "bun:test";
import { FakeEngine } from "./fake-engine";
import { defaultScenario } from "../scenario/scenario-io";

describe("FakeEngine — block + ledger", () => {
  it("starts on block 1 after applyScenario", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.applyScenario(defaultScenario());
    expect(e.getState().currentBlock).toBe(1);
  });
  it("forgeNextBlock advances the block and re-arms stepping", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.applyScenario(defaultScenario());
    const s = e.forgeNextBlock();
    expect(s.currentBlock).toBe(2);
    expect(s.status).not.toBe("finished");
  });
  it("getLedger lists accounts and only transactions up to the current block", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.applyScenario({
      version: 2,
      creator: "555",
      accounts: [{ id: "1001", balance: "100" }],
      transactions: [
        { block: 1, sender: "1001", amount: "5" },
        { block: 3, sender: "1002", amount: "0" },
      ],
    });
    const l1 = e.getLedger();
    expect(l1.currentBlock).toBe(1);
    expect(l1.accounts.map((a) => a.id)).toContain("1001");
    expect(l1.transactions.length).toBe(1); // block-3 tx not delivered yet
    e.forgeNextBlock();
    e.forgeNextBlock();
    expect(e.getLedger().transactions.length).toBe(2);
  });
});
```

- [ ] **Step 2: Write failing controller tests**

Append to `src/features/simulator/debug-controller.test.ts` (add these `it`s inside the existing `describe("DebugController", ...)`):

```ts
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
    c.start("a\nb\nc", { version: 2, creator: "boss", accounts: [], transactions: [] });
    expect(engine.lastCreatorId).toBe("boss");
  });
```

- [ ] **Step 3: Write failing adapter (real-engine) tests**

Append to `src/features/simulator/engine/simulator-engine.test.ts` (new `describe`):

```ts
describe("ScSimulatorEngine — block + ledger", () => {
  const C = "#pragma maxAuxVars 2\nlong n, acc;\nvoid main() { n = 3; acc = n + 1; }";

  it("reports currentBlock 1 after applying a scenario", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario(defaultScenario());
    expect(e.getState().currentBlock).toBe(1);
  });

  it("forgeNextBlock advances currentBlock", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario(defaultScenario());
    expect(e.forgeNextBlock().currentBlock).toBe(2);
  });

  it("getLedger lists the contract account and the activation tx", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario(defaultScenario());
    const l = e.getLedger();
    expect(l.currentBlock).toBe(1);
    expect(l.accounts.some((a) => a.id === "contract")).toBe(true);
    expect(l.transactions.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun test src/features/simulator`
Expected: FAIL (`currentBlock`/`forgeNextBlock`/`getLedger`/`lastCreatorId` do not exist).

- [ ] **Step 5: Extend the engine types**

In `src/features/simulator/engine/engine.types.ts`, add `currentBlock` to `DebugState`, add the ledger types, and add the two interface members. The full file:

```ts
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
```

- [ ] **Step 6: Implement in FakeEngine**

Replace the entire contents of `src/features/simulator/engine/fake-engine.ts`:

```ts
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
```

- [ ] **Step 7: Add controller relays**

In `src/features/simulator/debug-controller.ts`, update the type import and add two methods.

Change the import line to:

```ts
import type { SimulatorEngine, DebugState, LedgerState } from "./engine/engine.types";
```

Add these methods to the `DebugController` class (e.g. after `continue`):

```ts
  forgeNextBlock(): DebugState {
    return this.engine.forgeNextBlock();
  }

  getLedger(): LedgerState {
    return this.engine.getLedger();
  }
```

- [ ] **Step 8: Implement adapter read methods**

In `src/features/simulator/engine/simulator-engine.ts`:

(a) Update the type import to include the ledger types:

```ts
import type { DebugState, DebugStatus, EmittedTx, LedgerAccount, LedgerState, LedgerTx, SimulatorEngine } from "./engine.types";
```

(b) Replace the `accountIds`/`nextAccountId` fields with a reverse-name map. Change:

```ts
  private accountIds = new Map<string, bigint>();
  private nextAccountId = 1000n;
  private breakpointLines = new Set<number>();
```

to:

```ts
  private idToName = new Map<bigint, string>();
  private breakpointLines = new Set<number>();
```

(c) Replace `idFor` with a numeric parser (account ids are validated numeric now) and add a `nameFor` helper right after it:

```ts
  private idFor(idStr: string): bigint {
    return BigInt(idStr.replace(/_/g, ""));
  }

  private nameFor(id: bigint): string {
    return this.idToName.get(id) ?? String(id);
  }
```

(d) In `init()`, register the contract + fee account names (after `this.contractId` is set, before `submitScenario`):

```ts
    this.contractId = contract ? contract.contract : null;
    if (this.contractId !== null) this.idToName.set(this.contractId, "contract");
    this.idToName.set(0n, "fees");
```

(e) Add `currentBlock` to **both** `getState` return objects. In the no-dump early return:

```ts
        currentSourceLine: null,
        currentBlock: this.node ? this.node.Blockchain.getCurrentBlock() : 0,
        memory: {},
```

and in the main return object (next to `instructionPointer`):

```ts
      instructionPointer: d.instructionPointer,
      currentSourceLine: currentSourceLine === null ? null : Number(currentSourceLine),
      currentBlock: this.node ? this.node.Blockchain.getCurrentBlock() : 0,
      memory,
```

(f) Add `forgeNextBlock` and `getLedger` methods (e.g. after `continue`):

```ts
  forgeNextBlock(): DebugState {
    this.node?.forgeBlock();
    return this.getState();
  }

  getLedger(): LedgerState {
    const bc = this.node?.Blockchain;
    if (!bc) return { currentBlock: 0, accounts: [], transactions: [] };
    const accounts: LedgerAccount[] = bc.accounts.map((a) => ({
      id: this.nameFor(a.id),
      balance: String(a.balance),
      tokens: (a.tokens ?? []).map((t) => ({ asset: String(t.asset), quantity: String(t.quantity) })),
    }));
    const transactions: LedgerTx[] = bc.transactions.map((t) => ({
      block: t.blockheight + 1,
      txId: String(t.txid),
      sender: this.nameFor(t.sender),
      recipient: this.nameFor(t.recipient),
      amount: String(t.amount),
      ...(t.messageText ? { message: t.messageText } : {}),
    }));
    return { currentBlock: bc.getCurrentBlock(), accounts, transactions };
  }
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `bun test src/features/simulator`
Expected: PASS (all files).

- [ ] **Step 10: Commit**

```bash
git add src/features/simulator/engine src/features/simulator/debug-controller.ts src/features/simulator/debug-controller.test.ts
git commit -m "feat(sim): per-block forging + ledger reader on the engine seam

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Adapter reparatur — pre-fund accounts + wire creator

**Files:**
- Modify: `src/features/simulator/engine/simulator-engine.ts`
- Modify: `src/features/simulator/engine/simulator-engine.test.ts`
- Modify: `src/features/simulator/debug-controller.ts`

- [ ] **Step 1: Write the failing real-engine tests**

Append to `src/features/simulator/engine/simulator-engine.test.ts`:

```ts
describe("ScSimulatorEngine — scenario application", () => {
  const C = "#pragma maxAuxVars 2\nlong n, acc;\nvoid main() { n = 3; acc = n + 1; }";

  it("pre-funds a sender so its balance is not negative after activation", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario({
      version: 2,
      creator: "555",
      accounts: [{ id: "1001", balance: "100_0000_0000" }],
      transactions: [{ block: 1, sender: "1001", amount: "5_0000_0000" }],
    });
    const alice = e.getLedger().accounts.find((a) => a.id === "1001");
    expect(alice).toBeDefined();
    expect(BigInt(alice!.balance)).toBe(9500000000n); // 100e8 - 5e8, not negative
  });

  it("delivers a transaction scheduled for a later block only after forging to it", () => {
    const e = new ScSimulatorEngine();
    e.load(C);
    e.applyScenario({
      version: 2,
      creator: "555",
      accounts: [{ id: "1001", balance: "100_0000_0000" }],
      transactions: [
        { block: 1, sender: "1001", amount: "5_0000_0000" },
        { block: 3, sender: "1001", amount: "1_0000_0000", message: "later" },
      ],
    });
    expect(e.getLedger().transactions.some((t) => t.block === 3)).toBe(false);
    e.forgeNextBlock(); // -> block 2
    e.forgeNextBlock(); // -> block 3, delivers the block-3 tx
    expect(e.getLedger().transactions.some((t) => t.block === 3)).toBe(true);
  });

  it("accepts a numeric creator and honours a self-defined txId in the ledger", () => {
    const e = new ScSimulatorEngine();
    e.load(C, "555");
    e.applyScenario({
      version: 2,
      creator: "555",
      accounts: [{ id: "1001", balance: "100_0000_0000" }],
      transactions: [{ block: 1, sender: "1001", amount: "5_0000_0000", txId: "1234567890" }],
    });
    expect(e.getLedger().transactions.some((t) => t.txId === "1234567890")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/features/simulator/engine/simulator-engine.test.ts`
Expected: FAIL — the pre-funded sender's balance is negative (`-500000000`) because accounts are not seeded, and the self-defined `txId` is absent (a random id is assigned) because `txId` is not yet passed through.

- [ ] **Step 3: Wire the creator via idFor**

In `src/features/simulator/engine/simulator-engine.ts`, change `load`:

```ts
  load(cSource: string, creatorId?: string): void {
    this.cSource = cSource;
    this.creatorId = creatorId ? this.idFor(creatorId) : Constants.creatorID;
    this.init();
  }
```

- [ ] **Step 4: Pre-fund accounts before forging**

In `src/features/simulator/engine/simulator-engine.ts`, update `submitScenario` to seed balances before `setScenario`/`forgeBlock`:

```ts
  private submitScenario(): void {
    if (!this.node || !this.scenario || this.contractId === null) return;
    // Pre-fund declared accounts before any tx is processed (else senders go negative).
    for (const acc of this.scenario.accounts) {
      this.node.Blockchain.addBalanceTo(this.idFor(acc.id), BigInt(acc.balance.replace(/_/g, "")));
    }
    // Activation txs are submitted at blockheight 0 (the chain's current height
    // before forging); one forgeBlock() then activates the contract.
    const txs = toEngineTxs(this.scenario, String(this.contractId)).map((t) => ({
      sender: String(this.idFor(t.sender)),
      recipient: String(this.contractId),
      amount: t.amount.replace(/_/g, ""),
      blockheight: t.blockheight,
      ...(t.txId ? { txid: t.txId.replace(/_/g, "") } : {}),
      ...(t.message ? { messageText: t.message } : {}),
    }));
    this.node.setScenario(JSON.stringify(txs));
    this.node.forgeBlock();
  }
```

- [ ] **Step 5: Default the controller's creator to scenario.creator**

In `src/features/simulator/debug-controller.ts`, update `start`:

```ts
  start(cSource: string, scenario: ScenarioFile, creatorId?: string): DebugState {
    this.engine.load(cSource, creatorId ?? scenario.creator);
    this.engine.applyScenario(scenario);
    return this.engine.getState();
  }
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `bun test src/features/simulator`
Expected: PASS (all files). In particular the pre-fund + named-creator + block-3-delivery tests are green.

- [ ] **Step 7: Commit**

```bash
git add src/features/simulator/engine/simulator-engine.ts src/features/simulator/engine/simulator-engine.test.ts src/features/simulator/debug-controller.ts
git commit -m "fix(sim): pre-fund scenario accounts and wire the contract creator

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Ledger tab in the bottom dock

**Files:**
- Modify: `src/features/simulator/ui/bottom-dock.tsx`

> No component test harness exists in this repo (all tests are `bun:test` logic tests), so this UI task is gated by transpile + a manual check, matching the existing debugger UI's testing approach.

- [ ] **Step 1: Add the Ledger tab + view**

Replace the entire contents of `src/features/simulator/ui/bottom-dock.tsx`:

```tsx
import { useState } from "react";
import type { DebugState, LedgerState } from "../engine/engine.types";

type Tab = "ledger" | "console" | "txs" | "balance";

export function BottomDock({ state, ledger }: { state: DebugState | null; ledger: LedgerState | null }) {
  const [tab, setTab] = useState<Tab>("ledger");
  const tabs: { id: Tab; label: string }[] = [
    { id: "ledger", label: `Ledger${ledger ? ` · block ${ledger.currentBlock}` : ""}` },
    { id: "console", label: "Console" },
    { id: "txs", label: `Emitted Txs (${state?.emittedTx.length ?? 0})` },
    { id: "balance", label: "Balance" },
  ];
  return (
    <div className="h-[150px] shrink-0 border-t flex flex-col text-xs">
      <div className="flex border-b shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={"px-3 py-1 " + (tab === t.id ? "bg-blue-500/20 font-medium" : "opacity-70")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono">
        {tab === "ledger" && <LedgerView ledger={ledger} />}
        {tab === "console" && (
          <>
            <div>
              status: {state?.status ?? "ready"} · step {state?.steps ?? 0}
            </div>
            {state?.error && <div className="text-red-500">error: {state.error}</div>}
          </>
        )}
        {tab === "txs" && (
          <>
            {(state?.emittedTx ?? []).length === 0 && <div className="opacity-50">— none —</div>}
            {(state?.emittedTx ?? []).map((tx, i) => (
              <div key={i}>
                → {tx.recipient} : {tx.amount}
                {tx.message ? ` · "${tx.message}"` : ""}
              </div>
            ))}
          </>
        )}
        {tab === "balance" && <div>contract balance: {state?.balance ?? "0"}</div>}
      </div>
    </div>
  );
}

function LedgerView({ ledger }: { ledger: LedgerState | null }) {
  if (!ledger) return <div className="opacity-50">— no ledger —</div>;
  return (
    <div className="flex gap-6">
      <div className="min-w-[240px]">
        <div className="font-medium mb-1">Accounts · block {ledger.currentBlock}</div>
        {ledger.accounts.length === 0 && <div className="opacity-50">— none —</div>}
        <table className="border-collapse">
          <tbody>
            {ledger.accounts.map((a) => (
              <tr key={a.id}>
                <td className="pr-3">{a.id}</td>
                <td className="pr-3 text-right">{a.balance}</td>
                <td className="opacity-70">{a.tokens.map((t) => `${t.asset}×${t.quantity}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="min-w-[280px]">
        <div className="font-medium mb-1">Transactions</div>
        {ledger.transactions.length === 0 && <div className="opacity-50">— none —</div>}
        {ledger.transactions.map((t, i) => (
          <div key={i}>
            #{t.block} · tx {t.txId} · {t.sender} → {t.recipient} : {t.amount}
            {t.message ? ` · "${t.message}"` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify it transpiles**

Run: `bun run build`
Expected: build succeeds. (`BottomDock` now requires a `ledger` prop — the last call site is fixed in Task 5, so a standalone `tsc` will flag `debug-view.tsx` until then; the transpile still succeeds.)

- [ ] **Step 3: Commit**

```bash
git add src/features/simulator/ui/bottom-dock.tsx
git commit -m "feat(sim): ledger tab (accounts + tx history) in the debug dock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Forge-Next-Block control + block indicator + debug-view wiring

**Files:**
- Modify: `src/features/simulator/ui/debug-toolbar.tsx`
- Modify: `src/features/simulator/ui/debug-view.tsx`

- [ ] **Step 1: Add the toolbar button + block indicator**

Replace the entire contents of `src/features/simulator/ui/debug-toolbar.tsx`:

```tsx
import type { DebugState } from "../engine/engine.types";

interface Props {
  state: DebugState | null;
  onStep: () => void;
  onStepInto: () => void;
  onContinue: () => void;
  onForgeNextBlock: () => void;
  onReset: () => void;
  onClose: () => void;
  viewMode: "source" | "asm";
  onViewMode: (mode: "source" | "asm") => void;
}

export function DebugToolbar({
  state,
  onStep,
  onStepInto,
  onContinue,
  onForgeNextBlock,
  onReset,
  onClose,
  viewMode,
  onViewMode,
}: Props) {
  const status = state?.status ?? "ready";
  const done = status === "finished" || status === "error";
  return (
    <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onContinue} disabled={done}>
        ▶ Continue
      </button>
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onStepInto} disabled={done}>
        Step Into
      </button>
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onStep} disabled={done}>
        Step (asm)
      </button>
      <button
        className="px-2 py-0.5 border rounded"
        onClick={onForgeNextBlock}
        title="Forge the next block and deliver its scheduled transactions"
      >
        ⛏ Next Block
      </button>
      <button className="px-2 py-0.5 border rounded" onClick={onReset}>
        Reset
      </button>
      <span className="mx-1 inline-flex rounded border overflow-hidden">
        <button
          className={"px-2 py-0.5 " + (viewMode === "source" ? "bg-blue-500/30" : "")}
          onClick={() => onViewMode("source")}
        >
          source
        </button>
        <button
          className={"px-2 py-0.5 border-l " + (viewMode === "asm" ? "bg-blue-500/30" : "")}
          onClick={() => onViewMode("asm")}
        >
          asm
        </button>
      </span>
      <span className="ml-auto opacity-70">
        block {state?.currentBlock ?? 0} · {status} · step {state?.steps ?? 0} · line{" "}
        {state?.currentSourceLine ?? "—"}
        {state && state.breakpoints.length > 0 ? ` · bp ${state.breakpoints.join(",")}` : ""}
      </span>
      <button className="px-2 py-0.5 border rounded" onClick={onClose}>
        ✕ Close
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Wire the debug view**

In `src/features/simulator/ui/debug-view.tsx`:

(a) Add `LedgerState` to the engine-types import:

```ts
import type { DebugState, LedgerState } from "../engine/engine.types";
```

(b) In `DebugSession`, add ledger state next to the `state` state:

```ts
  const [state, setState] = useState<DebugState | null>(null);
  const [ledger, setLedger] = useState<LedgerState | null>(null);
```

(c) In `onMount`, after `setState(controller.start(source, scenario))`, also capture the ledger:

```ts
      setState(controller.start(source, scenario));
      setLedger(controller.getLedger());
      setAssembly(controller.getAssembly());
```

(d) Add forge + reset handlers (near the existing `run` helper) that refresh the ledger, and keep `run` for the step actions:

```ts
  const run = (fn: () => DebugState) => () => {
    if (controllerRef.current) setState(fn());
  };

  const onForgeNextBlock = () => {
    if (controllerRef.current) {
      setState(controllerRef.current.forgeNextBlock());
      setLedger(controllerRef.current.getLedger());
    }
  };

  const onReset = () => {
    if (controllerRef.current) {
      setState(controllerRef.current.reset());
      setLedger(controllerRef.current.getLedger());
    }
  };
```

(e) Update the `<DebugToolbar>` usage: replace the `onReset={run(...)}` prop and add `onForgeNextBlock`:

```tsx
      <DebugToolbar
        state={state}
        onStep={run(() => controllerRef.current!.step())}
        onStepInto={run(() => controllerRef.current!.stepInto())}
        onContinue={run(() => controllerRef.current!.continue())}
        onForgeNextBlock={onForgeNextBlock}
        onReset={onReset}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onClose={onClose}
      />
```

(f) Pass the ledger to the dock — change `<BottomDock state={state} />` to:

```tsx
      <BottomDock state={state} ledger={ledger} />
```

- [ ] **Step 3: Verify it transpiles**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 4: Targeted typecheck (best-effort)**

Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/simulator"`
Expected: only the **pre-existing** monaco `IStandaloneCodeEditor` "not assignable" errors in `asm-view.tsx` and `debug-view.tsx` (duplicate monaco install). No errors mentioning `bottom-dock.tsx`, `debug-toolbar.tsx`, `engine`, `scenario`, or `debug-controller`.

- [ ] **Step 5: Manual verification**

Run `bun run dev`, open a `.smart.c` contract, click **Debug**. Confirm:
- Toolbar shows `block 1` after start; the **Ledger** tab (default) lists the `contract` account (positive balance) and the sender (e.g. `1001`) with a **non-negative** balance, plus the activation tx.
- Stepping through the contract works as before.
- Clicking **⛏ Next Block** increments the block indicator and, for a scenario with a later-block tx, that tx appears in the Ledger's Transactions list at the right block.

- [ ] **Step 6: Commit**

```bash
git add src/features/simulator/ui/debug-toolbar.tsx src/features/simulator/ui/debug-view.tsx
git commit -m "feat(sim): forge-next-block control + block indicator + ledger wiring

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full simulator test run**

Run: `bun test src/features/simulator`
Expected: PASS, no failures.

- [ ] **Step 2: Full build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Confirm the whole scenario round-trips manually**

With `bun run dev`: create a fresh scenario via **New Scenario** on a contract (writes a v2 `.scenario.json`), edit it to add a `block: 3` transaction, save, open **Debug**, and confirm the picker + ledger + Next-Block flow behave per the spec.

Then hand off via **superpowers:finishing-a-development-branch**.

---

## Self-Review

**Spec coverage:**
- §4 Schema v2 → Task 1 (types + io). ✓
- §4 "No backward compatibility" (reject non-2) → Task 1 Step 1 test + `validateScenario`. ✓
- §4 numeric account ids (`creator`/`id`/`sender`) + optional numeric `txId` → Task 1 (validation `isNum` + types + mapping) and Task 3 (adapter `txid` passthrough). ✓
- §6 `LedgerTx.txId` displayed → Task 2 (type + `getLedger`), Task 4 (`LedgerView`). ✓
- §5 creator wiring → Task 3 Steps 3, 5. ✓
- §5 pre-fund accounts → Task 3 Step 4. ✓
- §5 single initial forge → unchanged `submitScenario` forges once (Task 1/3). ✓
- §5 `forgeNextBlock` → Task 2 Step 8(f). ✓
- §5 `currentBlock` → Task 2 Step 8(e). ✓
- §5 name resolution → Task 2 Step 8(c,d). ✓
- §6 Ledger types + `getLedger` → Task 2 Steps 5, 8(f). ✓
- §7 Forge button + block indicator → Task 5 Step 1. ✓
- §7 Ledger tab → Task 4. ✓
- §7 debug-view refresh on start/forge/reset (not per step) → Task 5 Step 2(c,d). ✓
- §10 tests (scenario-io, tx-mapping, FakeEngine, real-engine pre-fund/multi-block/creator) → Tasks 1–3. ✓

**Placeholder scan:** none — every code step contains full content.

**Type consistency:** `SimulatorEngine` gains `forgeNextBlock(): DebugState` + `getLedger(): LedgerState`, implemented identically in `FakeEngine` (Task 2 Step 6) and `ScSimulatorEngine` (Task 2 Step 8) and relayed by `DebugController` (Task 2 Step 7). `DebugState.currentBlock` is added to the interface (Task 2 Step 5) and set in every `getState` return (Fake + both adapter branches). `LedgerState`/`LedgerAccount`/`LedgerTx`/`LedgerToken` names are used consistently across `engine.types.ts`, `simulator-engine.ts`, `bottom-dock.tsx`, and `debug-view.tsx`. `BottomDock` prop `ledger` (Task 4) matches the call site (Task 5 Step 2f). `DebugToolbar` prop `onForgeNextBlock` (Task 5 Step 1) matches its usage (Task 5 Step 2e).
