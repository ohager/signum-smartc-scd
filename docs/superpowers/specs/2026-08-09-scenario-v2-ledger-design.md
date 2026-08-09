# Scenario v2 + Ledger / Debug-Context — Design

**Date:** 2026-08-09
**Status:** Approved (design), pending implementation plan
**Context:** SC-Simulator step-debugger sub-project (Phase 2). Follows Plans 1–3.

---

## 1. Problem

Investigation (source-verified against `smartc-signum-simulator@3.1.0`) showed the
debugger only *partially* applies a scenario:

1. **`accounts[].balance` is ignored.** `ScSimulatorEngine.submitScenario()` only
   converts `scenario.timeline`. Declared account balances are never written to the
   ledger, so senders go **negative** the moment they "send" to the contract
   (`blockchain.js` `addBalanceTo(sender, -amount)`).
2. **`contract.activationAmount` and `contract.creator` do nothing.** The activation
   threshold comes from the contract itself (`#program activationAmount`, default
   0.1 SIGNA). `creator` is never passed to `load()`, so it stays the default `555`.
3. **Only the first block of the timeline runs.** The adapter calls `forgeBlock()`
   exactly once. `addTransactions()` only lands txs whose `blockheight === currentBlock`,
   so anything after a `{type:"blocks"}` entry is silently dropped — multi-block
   scenarios never execute.

There is also **no ledger view**: the engine tracks a full ledger
(`Blockchain.accounts` = `{id, balance, tokens[]}`, `Blockchain.transactions`), but
none of it is surfaced.

## 2. Goal

Make scenarios take real effect and give the debugger a **Ledger / Debug-Context**:
which accounts exist (with balances + tokens), and the history of executed
transactions — advancing block by block.

## 3. Engine facts this design relies on (verified)

- **Debug granularity is per block.** Each `SimNode.forgeBlock()`:
  1. runs the previous block's contracts to completion (`postForgeBlock → run()`),
  2. `addTransactions()` — lands scenario txs with `blockheight === currentBlock`,
  3. increments `currentBlock`,
  4. `preForgeBlock()` — (re)activates the contract if an incoming tx at
     `blockheight === currentBlock - 1` has `amount >= activationAmount`.
  Execution then **pauses** so the current activation can be stepped.
- **`setScenario` holds all txs at once**; every `forgeBlock()` naturally consumes
  the ones matching the (pre-increment) `currentBlock`. So absolute block numbers map
  cleanly onto repeated forging.
- **Block mapping:** the initial `currentBlock` is `0`. The first `forgeBlock()`
  delivers txs at engine `blockheight 0` and leaves `currentBlock = 1`. So a
  user-facing 1-based **`block: N`** maps to engine **`blockheight = N - 1`**.
- **Balances/tokens must be pre-seeded** (`Blockchain.addBalanceTo` /
  `addTokensTo`) *before* the first forge.
- **Creator** is wired via `loadSmartContract(source, creatorID)`.
- **Ledger is readable** from `node.Blockchain.accounts` and
  `node.Blockchain.transactions`.

## 4. Scenario v2 schema

```json5
{
  version: 2,
  creator: "creator",            // account id used as the contract creator
  accounts: [
    { id: "alice", balance: "100_0000_0000" },
    { id: "bob",   balance: "50_0000_0000" },
  ],
  transactions: [
    { block: 1, sender: "alice", amount: "5_0000_0000", message: "activate" },
    { block: 3, sender: "bob",   amount: "0",           message: "getStatus" },
  ],
}
```

**Types** (`scenario/scenario.types.ts`):

```ts
export interface ScenarioTx {
  block: number;        // 1-based; block 1 = first forged (activation) block
  sender: string;       // account id (name or numeric)
  amount: string;       // NQT string; "_" separators allowed
  message?: string;     // → messageText
}

export interface ScenarioAccount {
  id: string;           // account id (name or numeric)
  balance: string;      // NQT string; "_" separators allowed
}

export interface ScenarioFile {
  version: 2;
  creator: string;
  accounts: ScenarioAccount[];
  transactions: ScenarioTx[];
}
```

**Validation rules** (`validateScenario`):
- `version === 2`.
- `creator` is a non-empty string.
- `accounts` is an array; each has string `id` + string `balance`.
- `transactions` is an array; each has integer `block >= 1`, string `sender`,
  string `amount`, optional string `message`.

**Removed vs v1:** the `contract { creator, activationAmount }` wrapper and the
`timeline` union (`{type:"tx"}` / `{type:"blocks"}`).

### v1 → v2 migration (on parse)

`parseScenario` detects a v1 document (`version === 1` with a `timeline` array) and
upgrades it in memory before validating:
- `creator` ← `v1.contract.creator` (fallback `"creator"`).
- `accounts` carried over unchanged.
- `activationAmount` dropped.
- `timeline` folded into `transactions`: walk the entries keeping a 1-based running
  block starting at 1; each `{type:"tx"}` becomes `{block, sender, amount, message?}`;
  each `{type:"blocks", count}` advances the running block by `count`.

`serializeScenario` always writes v2. `defaultScenario()` returns a v2 document.

## 5. Adapter changes (`engine/simulator-engine.ts`)

- **Creator:** `load(source, creatorId?)` already exists; `DebugController.start`
  passes `scenario.creator` so `creatorId = idFor(scenario.creator)`.
- **Pre-fund accounts:** in `init()`, after `loadSmartContract`, for every
  `scenario.accounts[]` call
  `node.Blockchain.addBalanceTo(idFor(a.id), BigInt(a.balance.replace(/_/g, "")))`.
  Done *before* any forge.
- **Transactions:** replace `to-engine-txs` mapping to emit, per `ScenarioTx`,
  `{ sender: idFor(tx.sender), recipient: contractId, amount, blockheight: tx.block - 1, messageText? }`.
  `setScenario(JSON.stringify(txs))` once.
- **Initial forge:** `init()`/`submitScenario()` forges **exactly one** block
  (`node.forgeBlock()`), landing on user block 1 (first activation).
- **New method `forgeNextBlock(): DebugState`** on `SimulatorEngine`:
  `node.forgeBlock(); return this.getState();`. Advances to the next block, delivering
  that block's scheduled txs and re-activating the contract if applicable.
- **`DebugState.currentBlock: number`** ← `node.Blockchain.getCurrentBlock()`.
- **New method `getLedger(): LedgerState`** (see below), read from `Blockchain`.
- **Name resolution for display:** keep a reverse map alongside `accountIds`
  (`idToName: Map<bigint,string>`) populated in `idFor`; also register the contract id
  as `"contract"` and account `0n` as `"fees"`. `nameFor(id)` returns the mapped name
  or the numeric string.

## 6. Ledger types

`engine/engine.types.ts`:

```ts
export interface LedgerToken { asset: string; quantity: string; }

export interface LedgerAccount {
  id: string;            // display name (or numeric id)
  balance: string;       // NQT string
  tokens: LedgerToken[];
}

export interface LedgerTx {
  block: number;         // 1-based display block (engine blockheight + 1)
  sender: string;        // display name
  recipient: string;     // display name
  amount: string;        // NQT string
  message?: string;
}

export interface LedgerState {
  currentBlock: number;
  accounts: LedgerAccount[];
  transactions: LedgerTx[];
}
```

`getLedger()` maps `Blockchain.accounts` → `LedgerAccount[]` (via `nameFor`) and
`Blockchain.transactions` → `LedgerTx[]` (`block = tx.blockheight + 1`,
`sender/recipient` via `nameFor`, amounts stringified).

`DebugController` gains `forgeNextBlock(): DebugState` and `getLedger(): LedgerState`
relays. `FakeEngine` implements both deterministically for controller/UI tests.

## 7. UI changes

- **Toolbar (`ui/debug-toolbar.tsx`):** add a **"⛏ Forge Next Block"** button and a
  **"Block N"** indicator (from `state.currentBlock`). Button always enabled while a
  session is live.
- **Ledger tab (`ui/bottom-dock.tsx`):** new **"Ledger"** tab alongside Console /
  Emitted Txs / Balance:
  - Header: current block height.
  - **Accounts** table: `id | balance (SIGNA) | tokens` (tokens shown as
    `asset×quantity`, empty if none).
  - **Transactions** table: `block | sender → recipient | amount | message`.
  - "Emitted Txs" (pending `enqueuedTX` of the *current* execution) stays separate =
    outgoing txs not yet committed; Ledger = committed chain state.
- **`debug-view.tsx` / `DebugSession`:** hold `ledger` state; refresh it after
  `start`, `forgeNextBlock`, and `reset` (not on every step — the committed ledger
  only changes when a block is forged). Wire the toolbar's forge button to
  `controller.forgeNextBlock()` + `controller.getLedger()`.

## 8. Data flow

```
ScenarioFile (v2)
   → DebugController.start(source, scenario, scenario.creator)
       → engine.load(source, creatorId=idFor(creator))
           → deploy + pre-fund accounts (addBalanceTo)
       → engine.applyScenario(scenario)
           → setScenario(txs blockheight=block-1) + forgeBlock() once  // block 1
   → UI steps within the current activation (step / stepInto / continue)
   → "Forge Next Block" → engine.forgeNextBlock() → next block's txs + re-activate
   → Ledger tab reads engine.getLedger() after each forge/start/reset
```

## 9. Error handling

- Invalid scenario JSON5 / structure → `parseScenario` throws; `DebugView` already
  falls back to `defaultScenario()` with a toast (unchanged).
- Forging past the last scheduled tx simply advances the block height; the contract
  may not re-activate → status `finished`/`stopped`. This is valid and informative
  (no special-casing).
- Amount/balance strings strip `_` before `BigInt(...)`; a non-numeric value is a
  validation error, not a runtime throw.

## 10. Testing strategy

- **`scenario-io` (pure, bun:test):** v2 round-trip (serialize→parse); v1→v2 migration
  (timeline + blocks → transactions with correct block numbers; activationAmount
  dropped); validation rejects bad `version`, missing fields, `block < 1`.
- **tx mapping (pure):** v2 `transactions` → engine txs with `blockheight = block-1`
  and stripped underscores.
- **`FakeEngine`:** deterministic `currentBlock`, `forgeNextBlock`, `getLedger` so
  controller + UI logic are tested without the real VM.
- **`ScSimulatorEngine` (real SimNode, headless):** a tiny contract verifying
  (a) a pre-funded sender's balance is **not negative** after activation,
  (b) a tx scheduled at `block: 3` is delivered only after forging to block 3,
  (c) `creator` is the wired id (contract sees the creator account).

## 11. Out of scope (explicitly deferred)

- **Scenario form UI** (form over the JSON5 editor) — separate spec/plan after this.
- **Token holdings/transfers in the scenario** — ledger *displays* tokens now, but the
  scenario schema stays SIGNA-only for now.
- **Call-stack tab, richer Watch expressions, time-travel** — later debugger-depth work.
- Aligning the simulator's bundled compiler with the editor's `smartc-signum-compiler`.
```
