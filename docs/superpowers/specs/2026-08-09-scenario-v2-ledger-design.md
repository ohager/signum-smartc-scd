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
  creator: "555",                // numeric account id of the contract creator
  accounts: [
    { id: "1001", balance: "100_0000_0000" },
    { id: "1002", balance: "50_0000_0000" },
  ],
  transactions: [
    { block: 1, sender: "1001", amount: "5_0000_0000", message: "activate" },
    { block: 3, sender: "1002", amount: "0", txId: "1002000000003", message: "getStatus" },
  ],
}
```

**Account ids are numeric.** Signum account IDs are 64-bit integers; using them
verbatim lets contract code compare against concrete ids (`sender == 1001`) and keeps
scenarios faithful to a real node. `_` digit separators are allowed and stripped.
`txId` is optional (a random id is assigned when omitted) and useful when the contract
reads/dedups by transaction id.

**Types** (`scenario/scenario.types.ts`):

```ts
export interface ScenarioTx {
  block: number;        // 1-based; block 1 = first forged (activation) block
  sender: string;       // numeric account id (bigint as string; "_" allowed)
  amount: string;       // NQT string; "_" separators allowed
  txId?: string;        // optional self-defined tx id (bigint as string); random if omitted
  message?: string;     // → messageText
}

export interface ScenarioAccount {
  id: string;           // numeric account id (bigint as string; "_" allowed)
  balance: string;      // NQT string; "_" separators allowed
}

export interface ScenarioFile {
  version: 2;
  creator: string;      // numeric account id (bigint as string)
  accounts: ScenarioAccount[];
  transactions: ScenarioTx[];
}
```

**Validation rules** (`validateScenario`), where a "numeric string" matches
`/^[0-9_]+$/` with at least one digit:
- `version === 2`.
- `creator` is a numeric string.
- `accounts` is an array; each has a numeric `id` + numeric `balance`.
- `transactions` is an array; each has integer `block >= 1`, numeric `sender`,
  numeric `amount`, optional numeric `txId`, optional string `message`.

**Removed vs v1:** the `contract { creator, activationAmount }` wrapper and the
`timeline` union (`{type:"tx"}` / `{type:"blocks"}`).

### No backward compatibility

v1 was never deployed, so there is **no migration**. `parseScenario` accepts only
`version === 2`; any pre-existing local `.scenario.json` in the old v1 shape simply
fails validation and the caller falls back to the built-in default (existing
`DebugView` behaviour). Old files should be recreated via "New Scenario".
`serializeScenario` writes v2; `defaultScenario()` returns a v2 document.

## 5. Adapter changes (`engine/simulator-engine.ts`)

- **Creator:** `DebugController.start` passes `scenario.creator`; `load` resolves it
  via `idFor` (= `BigInt(id.replace(/_/g, ""))`) so a numeric creator id is wired into
  `loadSmartContract(source, creatorId)`.
- **Pre-fund accounts:** in `submitScenario()`, before `setScenario`/`forgeBlock`, for
  every `scenario.accounts[]` call
  `node.Blockchain.addBalanceTo(idFor(a.id), BigInt(a.balance.replace(/_/g, "")))`.
  Done *before* any forge.
- **Transactions:** replace `to-engine-txs` mapping to emit, per `ScenarioTx`,
  `{ sender: idFor(tx.sender), recipient: contractId, amount, blockheight: tx.block - 1, txid?, messageText? }`.
  A self-defined `txId` is passed through as a string (the sim's JSON reviver converts
  numeric strings to bigint and strips `_`); random ids are only assigned when omitted.
  `setScenario(JSON.stringify(txs))` once.
- **Initial forge:** `init()`/`submitScenario()` forges **exactly one** block
  (`node.forgeBlock()`), landing on user block 1 (first activation).
- **New method `forgeNextBlock(): DebugState`** on `SimulatorEngine`:
  `node.forgeBlock(); return this.getState();`. Advances to the next block, delivering
  that block's scheduled txs and re-activating the contract if applicable.
- **`DebugState.currentBlock: number`** ← `node.Blockchain.getCurrentBlock()`.
- **New method `getLedger(): LedgerState`** (see below), read from `Blockchain`.
- **Name resolution for display:** an `idToName: Map<bigint,string>` labels only the
  contract id (`"contract"`) and account `0n` (`"fees"`). `nameFor(id)` returns the
  mapped label or the numeric id as a string (all user accounts show as their number).

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
  txId: string;          // transaction id (bigint as string)
  sender: string;        // display name (numeric id, or "contract"/"fees")
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
`txId = String(tx.txid)`, `sender/recipient` via `nameFor`, amounts stringified).

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

- **`scenario-io` (pure, bun:test):** v2 round-trip (serialize→parse); validation
  rejects a non-2 `version`, missing fields, and `block < 1` (an old v1-shaped
  document is rejected so the caller falls back to the default).
- **tx mapping (pure):** v2 `transactions` → engine txs with `blockheight = block-1`
  and `txId` passed through when present.
- **`FakeEngine`:** deterministic `currentBlock`, `forgeNextBlock`, `getLedger` so
  controller + UI logic are tested without the real VM.
- **`ScSimulatorEngine` (real SimNode, headless):** a tiny contract verifying
  (a) a pre-funded sender's balance is **not negative** after activation,
  (b) a tx scheduled at `block: 3` is delivered only after forging to block 3,
  (c) a numeric `creator` is accepted and wired, and
  (d) a self-defined `txId` shows up in the ledger's transaction history.

## 11. Out of scope (explicitly deferred)

- **Scenario form UI** (form over the JSON5 editor) — separate spec/plan after this.
- **Token holdings/transfers in the scenario** — ledger *displays* tokens now, but the
  scenario schema stays SIGNA-only for now.
- **Call-stack tab, richer Watch expressions, time-travel** — later debugger-depth work.
- Aligning the simulator's bundled compiler with the editor's `smartc-signum-compiler`.
```
