# SC-Simulator API — Spike Findings (Slice 1)

Status: throwaway spike, not a product feature. Goal: learn how to drive deleterium's
SC-Simulator engine headlessly so a later slice can build a step-debugger for
`apps/studio`.

## 1. Sourcing decision

**Decision: depend on the published package `smartc-signum-simulator@3.1.0`.**
Do not vendor. No files were copied into `apps/studio/src`.

Evidence:

- `npm view signum-smartc-testbed dependencies` (the studio owner's own SmartC
  testbed project) resolves to:
  ```json
  {
    "smartc-signum-compiler": "2.3.0",
    "smartc-signum-simulator": "^3.1.0"
  }
  ```
- `npm view smartc-signum-simulator` confirms the package exists, `latest: 3.1.0`,
  homepage `https://github.com/deleterium/SC-Simulator`. (npm's registry
  metadata prints the license as "Proprietary" — this is a red herring/registry
  quirk. The actual `LICENSE` file inside the published tarball is genuine
  **BSD 3-Clause, Copyright (c) 2021, Rui Santana**, and every `dist/*.js` file
  carries the header `// License: BSD 3-Clause License`. Verified by unpacking
  `npm pack smartc-signum-simulator@3.1.0` and reading the contents directly.)
- The package is exactly deleterium's own `npm run pack:pkg` / `publish:pkg`
  output described in the established facts: `package.json` inside the tarball
  still has the `build:pkg` / `pack:pkg` / `publish:pkg` scripts and
  `tsconfig.pkg.json`, and its `dependencies` are empty — it bundles
  `smartc-signum-compiler` only as an internal import resolved from the
  consumer's `node_modules` (`smartc-signum-compiler: ^2.3.0` is a devDependency
  of the simulator repo, used at build time to type-check/import; at runtime
  the published `dist/index.js` does `import { SmartC } from
  'smartc-signum-compiler'`, so the consuming app needs that package too —
  `apps/studio` already has `smartc-signum-compiler@2.3.0`).
- The published package is a pure TypeScript class library (`dist/*.js` +
  `.d.ts`), **no DOM dependency** — confirmed by running it directly under
  `bun` in a plain Node-style script (see §2).

Rationale for package over vendor: it's maintained by the same author as the
canonical repo, versioned, small (48 KB packed / 323 KB unpacked), exposes
exactly the load/step/inspect surface we need, and its own README explicitly
recommends it for automated testing / TDD outside the browser (it name-checks
`signum-smartc-testbed`, the sibling project by our own repo's owner). Vendoring
would just recreate what npm already gives us with less maintenance burden.

`apps/studio/package.json` should add:
```json
"smartc-signum-simulator": "^3.1.0"
```
(not yet added to the real `package.json` — this spike only proved it out in
`apps/studio/scratch/`, which was deleted before commit, per instructions.)

## 2. Drivability — SUCCESSFULLY DRIVEN HEADLESSLY

The engine was installed and driven end-to-end with `bun run <script>.ts`
(no browser/DOM, no `try.html`/`try.js` involved). This directly contradicts
nothing in the established facts, but **refines** the "feed it
`getAssemblyCode()` output" framing — see §3.

Proof scripts lived in `apps/studio/scratch/drive-test/` (deleted before
commit). Key transcript excerpts are reproduced in §5/§6 below.

## 3. Constructing / driving the engine

There are two levels of API, both in package `smartc-signum-simulator`:

### 3.1 High-level convenience: `SimNode` (recommended for our debugger)

```ts
import { SimNode, Constants } from "smartc-signum-simulator";

const node = new SimNode();                    // creates BLOCKCHAIN + SIMULATOR
const contract = node.loadSmartContract(cSource, Constants.creatorID /*, contractID? */);
```

**Important refinement of the established facts:** `SimNode.loadSmartContract`
takes **C source**, not assembly. Internally it does:
```ts
new SmartC({ language: 'C', sourceCode: source + '\n#pragma verboseAssembly true\n' }).compile()
```
i.e. it force-appends `#pragma verboseAssembly true` and recompiles the C
itself, then calls `getMachineCode()` and passes `AssemblyCode` down to
`Blockchain.deployContract(...)`. So if our app has already compiled via
`smartc-signum-compiler` in the editor and only has `getAssemblyCode()` /
`getMachineCode()` output, **don't use `loadSmartContract`** — use the
low-level path instead (§3.2), which takes assembly directly and is exactly
"feed it `getAssemblyCode()` output" as originally assumed.

`node.reset()` — resets `Blockchain` and `Simulator` (clears contracts,
breakpoints, scenario transactions, blockheight back to 0).

### 3.2 Low-level: feed pre-compiled assembly directly (matches original assumption)

```ts
import { SmartC } from "smartc-signum-compiler";
import { SimNode, Constants } from "smartc-signum-simulator"; // SimNode.Blockchain/.Simulator are public

const c = new SmartC({ language: "C", sourceCode: "#pragma verboseAssembly true\n" + src });
c.compile();
const assembly = c.getAssemblyCode();          // <-- exactly what our editor already produces

const node = new SimNode();
const contractObj = node.Blockchain.deployContract({
  asmSourceCode: assembly,                     // required
  cSourceCode: src,                            // optional but enables C-line breakpoints/stepping (see §3.4)
  creatorID: Constants.creatorID,
  contractID: Constants.contractID,
  // dataPages / userStackPages / codeStackPages / codeHashId optional
});
node.Simulator.setCurrentSlotContract(contractObj.contract);
```

Verified working (`apps/studio/scratch/drive-test/drive3-rawasm.ts`): deployed
directly from assembly text, `Simulator.isReady()` → `true`,
`asmCodeArr.length` matched `assembly.split("\n").length` exactly (1:1 line
correspondence, confirming instructionPointer indexes into this exact array).

### 3.3 Transactions-JSON scenario shape

`SimNode.setScenario(jsonString)` / `.appendScenario(jsonString)` parse a JSON
**array** of transaction objects (matching `TransactionObj`):

```json
[
  {
    "sender": "555",
    "recipient": "999",
    "amount": "10000000",
    "blockheight": 0,
    "messageText": "optional string",
    "messageHex": "optional hex string, ignored if messageText set",
    "tokens": [{ "asset": "101010", "quantity": "5" }],
    "txid": "optional, random if omitted"
  }
]
```

Field rules (from package README + `objTypes.ts`):
- `sender`/`recipient`/`amount`/`txid`/asset `asset`/`quantity` are `bigint`,
  but can be written as string, number, or `"123n"`-style bigint literal
  string; underscores in numeric strings are stripped (`"100_0000_0000n"`).
  Parsing goes through a custom reviver (`utils.parseTransactionObj`) —
  **note**: not standard JSON, single-line `//` comments in the JSON text are
  stripped before `JSON.parse`, and bigint literal suffix `n` is tolerated
  inside a JSON string.
- `blockheight` is a plain number: **critical gotcha** — a transaction is only
  picked up for activation when `tx.blockheight === currentBlock - 1` at the
  moment `preForgeBlock()` runs (i.e. immediately after the block-height
  counter increments during `forgeBlock()`). Concretely: to activate a
  contract on the very first forge, send the activation tx with
  `blockheight: 0` (the chain's current height *before* forging), then call
  `forgeBlock()` once — this brings the chain to height 1 and the tx (posted
  at height 0) satisfies `currentBlock - 1 === 0`. Sending `blockheight: 1`
  (i.e. "the height I want it to land at") does **not** activate on the next
  forge — it needs one more forge. This is easy to get backwards; got bitten
  by it during the spike (see drive1 vs drive2 scripts).
- Multiple transactions accumulate in `scenarioTransactions` and are all
  submitted on the next `forgeBlock()`/`forgeBlocks(n)`/`forgeUntilBlock(h)`
  call, then cleared implicitly (scenario list persists across
  `setScenario` calls only — `setScenario` replaces it, `appendScenario` adds).

### 3.4 Load / step / breakpoint / reset call shapes

All on `node.Simulator` (class `SIMULATOR`), operating on
`Simulator.CurrentContract` (set via `setCurrentSlotContract(contractAddress)`,
which also implicitly resets breakpoints/memory cache — calling it again on
the same contract clears breakpoints):

| Operation | Call | Notes |
|---|---|---|
| Load / select | `node.Simulator.setCurrentSlotContract(contractId: bigint)` | Returns `CONTRACT \| undefined`. Required after `Blockchain.deployContract` (low-level path); `loadSmartContract` already calls it internally. |
| Single assembly-instruction step | `contract.step(breakpoints?: number[]): string` | Lowest-level single-step, directly on the `CONTRACT` object (`node.Simulator.getCurrentSlotContract()`), not exposed as a one-liner on `SIMULATOR`. Empty string return = ok/continue; non-empty = status message ("Contract execution done on this round", "Stopped on breakpoint N", etc). |
| Step (debugger-style) | `node.Simulator.stepIntoSlotContract()` | **Not** a single asm instruction — loops `contract.step()` until the mapped **C source line** changes (via `cToAsmMap`), or a stop condition hits. If no C source was attached, `cToAsmMap` is identity so this degenerates to true single-asm-step. |
| Step over | `node.Simulator.stepOverSlotContract()` | Same C-line loop as step-into, but also loops while `CodeStack.length !== startingStackLength` (skips over CALL/subroutine frames). |
| Step out | `node.Simulator.stepOutSlotContract()` | Loops `contract.step()` while `CodeStack.length >= startingStackLength` (runs until current call frame returns). |
| Run to breakpoint | `node.Simulator.runSlotContract()` | Delegates to `contract.run(breakpoints)`; runs until a breakpoint, error, or contract finishes/freezes/dies for the round. |
| Toggle breakpoint | `node.Simulator.toggleBreakpoint(bpline: number)` | **Dual addressing mode**, auto-detected from whether a C source was attached (`CurrentContract.cCodeArr.length > 1`): if C source present, `bpline` is a **1-based C source line number**, internally mapped through `cToAsmMap` to the correct assembly index; if pure-assembly deploy, `bpline` is a **1-based assembly line number** (`bpline--` to become the 0-based array index). Returns `"ADDED"`, `"REMOVED"`, or an error string like `"Line N is not an instruction. Breakpoint NOT added."` if the line has no executable instruction (blank/comment/label lines are skipped via `getNextInstructionLine`). |
| Clear breakpoints | `node.Simulator.clearAllBreakpoints()` | |
| List breakpoints | `node.Simulator.getBreakpoints(): number[]` | Returns raw internal (assembly-index) breakpoint list regardless of how they were added. |
| Reset | `node.reset()` (whole sim) or `node.Simulator.reset()` (debugger state only, keeps blockchain/contracts) | `node.reset()` resets `Blockchain` (clears accounts/contracts/height back to 0) and `Simulator` together. |
| Forge (advance chain / run pending contracts) | `node.forgeBlock()` / `forgeBlocks(n)` / `forgeUntilBlock(h)` | Sequence per block: (1) run all deployed contracts' `postForgeBlock()` (executes any contract still pending from previous round via `contract.run()`), (2) insert scenario transactions into the chain, (3) increment blockheight, (4) run all contracts' `preForgeBlock()` to check/apply activation for the new height. Forging is explicitly "paused after transactions inserted but before contract execution" per the package README, i.e. call `forgeBlock()` once to activate, then step/run the contract before the *next* forge triggers its `postForgeBlock()`. |

### 3.5 Reading state

All via `contract.dumpContractData()` (or the identical
`node.Simulator.dumpCurrentContractData()` — same shape, throws if no
contract selected):

- **Position**: `instructionPointer: number` — confirmed to be an **index into
  `asmCodeArr`** (the deployed assembly source split on `\n`), i.e. an
  assembly *line* index, not a raw bytecode address. `asmCodeArr[instructionPointer]`
  gives the literal assembly text of the current instruction. (Also exposed
  redundantly as `PCS: number`, same value — appears to be the raw VM program
  counter mirrored into the dump; in our tests `PCS === instructionPointer`
  always.)
- **Source-line cross-reference**: `cToAsmMap: number[]` — indexed the same as
  `asmCodeArr`; `cToAsmMap[instructionPointer]` gives the **1-based C source
  line** currently executing (only meaningful if verbose assembly / C source
  was supplied; otherwise it's an identity map of asm-array indices).
  `cCodeArr: string[]` is the original C source split by line (for
  side-by-side C view); `asmCodeArr: string[]` is the assembly, both included
  in every dump — no need to keep them separately.
- **Memory (by variable name)**: `Memory: MemoryObj[]`, each
  `{ varName: string, value: bigint, debugName?: string }`. `varName` values
  are exactly the identifiers from `smartc-signum-compiler`'s
  `getMachineCode().Memory` ordered array (confirmed: compiling
  `long n, acc;` with `#pragma maxAuxVars 2` yields compiler
  `Memory === ["r0","r1","n","acc"]`, and the simulator's `Memory` dump has
  matching `varName` entries `r0, r1, n, acc` in the same order). To map a
  compiler-time variable name to its live value: just find by `varName` in
  the dump's `Memory` array — no separate address translation needed, the
  engine already gives it by name (there is no separately exposed "memory
  address" — the assembly opcodes address by `@varName` symbol, and the VM
  keeps the name association through `MemoryObj`).
- **Registers**: `A: [bigint,bigint,bigint,bigint]` and
  `B: [bigint,bigint,bigint,bigint]` — the two 256-bit pseudo-registers as
  four 64-bit unsigned longs each (per package README: "256-bit pseudo-register
  A and B as its four longs parts A1..A4 and B1..B4").
- **Balance**: `balance: bigint` (current), `previousBalance: bigint`,
  `executionFee: bigint` (accumulated step-fee burned this round),
  `activationAmount: bigint`.
- **Emitted transactions**: `enqueuedTX: ContractTransactionObj[]` — filled
  during execution, only actually appended to `Blockchain.transactions` (and
  cleared from `enqueuedTX`) when the *next* block is forged
  (`postForgeBlock()` calls `Blockchain.addTransactions(this.enqueuedTX)`).
  So mid-step you inspect pending sends via `enqueuedTX`; post-forge you'd
  look at `node.Blockchain.transactions`.
- **Status flags**: `running`, `stopped`, `finished`, `frozen`, `dead`
  (booleans) — all present simultaneously in the dump; e.g. after a contract
  runs `FIN` to completion for the round, observed `finished: true,
  running: false`. `frozen` = out-of-funds/out-of-steps; `dead` = permanently
  terminated (bad code/pointer fault per README's "false dead state" caveat).
  `exception: string` and `ERR: number | null` carry error detail when
  something aborts execution.
- **Step count**: not directly exposed as a single field; `executionFee`
  divided by `Constants.stepfee` (`100000n`) gives steps-this-round, or track
  it yourself by counting `step()`/`stepIntoSlotContract()` calls. No
  built-in step counter field was found in `dumpContractData()`.
- **Contract/account balance beyond the current contract**:
  `node.Blockchain.getBalanceFrom(id: bigint): bigint`,
  `getTokenQuantityFrom(id, asset)`, `getAccountFromId(id)`.

## 4. Verbose assembly / source-map comment syntax

Confirmed by direct compilation test (`smartc-signum-compiler@2.3.0`):
putting `#pragma verboseAssembly true` as a source line (order doesn't
strictly need to be first — tested both first-line and pragma-after-other-
pragma, both worked; deleterium's own `loadSmartContract` appends it as the
*last* appended line) causes the compiler to interleave the assembly output
with:

```
^comment line N <original C source text of that line>
```

where `N` is the **1-based C source line number**. Example — compiling:
```c
#pragma verboseAssembly true
#pragma maxAuxVars 2
long n, acc;
void main() {
    n = 3;
    acc = n + 1;
}
```
produces this exact assembly (captured verbatim from
`SmartC.getAssemblyCode()`):
```
^declare r0
^declare r1
^declare n
^declare acc


^comment line 4 void main() {
PCS
^comment line 5     n = 3;
SET @n #0000000000000003
^comment line 6     acc = n + 1;
SET @acc $n
INC @acc
FIN
```

The simulator's `CONTRACT.buildMap()` parses exactly this pattern with the
regex `/^\s*\^comment line (\d+)\s+/` to build `cToAsmMap` (a running "current
C line" carried forward for every asm line until the next `^comment line`
marker updates it). If this pattern is absent entirely (verbose assembly off),
`buildMap()` detects `currCLine === 1` throughout and falls back to an
identity map (`cToAsmMap[i] = i`), i.e. debugging degrades gracefully to
assembly-line-only mode. There's a second, unrelated marker
`^comment scope REG1,REG2:TYPE` used by `buildScopeMap()` for register-scope
display — not needed for line mapping but present in verbose output; not
investigated further as out of scope for the debugger's line-stepping needs.

**Implication for our source-map parser**: match `^\s*\^comment line (\d+)\s+/`
against each assembly line; the last match before/at a given assembly index
gives that instruction's originating C line, exactly mirroring the engine's
own `buildMap()` algorithm. We can either replicate this parsing ourselves
(e.g. to show a source map in the UI before deploying to the simulator) or
just read the engine's already-computed `cToAsmMap`/`cCodeArr` off the
contract dump — the latter is simpler and battle-tested by the engine itself.

## 5. Proof transcript highlights (headless bun run)

Full deploy → activate → step → inspect → breakpoint → run cycle, all
executed successfully with `bun run <script>.ts`, no browser:

```
C contract successfully compiled and deployed at address 999. Ready to run
scenario: { scenarioTransactions: [ { sender: 555n, recipient: 999n, amount: 10000000n, blockheight: 0 } ] }

--- forge block 1 ---
height: 1
frozen/running/finished/dead: false true false false
instructionPointer: 7 balance: 10000000n

--- step into ---
IP: 9 asm line: SET @n #0000000000000003
Memory: [ {varName:"r0",value:0n}, {varName:"r1",value:0n}, {varName:"n",value:0n}, {varName:"acc",value:0n} ]

--- step into again (n = 3) ---
IP: 11 asm line: SET @acc $n
Memory: [ ..., {varName:"n",value:3n}, {varName:"acc",value:0n} ]
cToAsmMap maps IP->C line: 5

--- step into again (acc = n+1) ---
IP: 9 (wrapped — FIN reached, round done)
Memory: [ ..., {varName:"n",value:3n}, {varName:"acc",value:4n} ]

--- breakpoint at C-line 5 ---
toggle bp at C-line 5: ADDED
breakpoints (asm indices): [ 11 ]
run to breakpoint: Stopped on breakpoint 12.
IP after run: 11 asm: SET @acc $n   n= 3n

--- raw single-instruction step via CONTRACT.step() ---
IP now: 12 asm: INC @acc
```

(`acc = n + 1` correctly computed as `4n`, confirming execution semantics are
sane end to end.)

## 6. Summary answers to the required API facts

- **Construct/init**: `new SimNode()` (no args) — creates an internal
  `BLOCKCHAIN` + `SIMULATOR`. No DOM/browser needed.
- **Load**: either `node.loadSmartContract(cSource, creatorId)` (compiles C
  itself, forces verbose assembly on) or, for pre-compiled assembly from our
  own editor, `node.Blockchain.deployContract({asmSourceCode, cSourceCode?,
  ...})` + `node.Simulator.setCurrentSlotContract(contractId)`.
- **Single-step**: `contract.step(breakpoints?)` (true 1 asm instruction) or
  `node.Simulator.stepIntoSlotContract()` (steps until C-line changes, or 1
  asm instruction if no C source attached).
- **Run-to-breakpoint**: `node.Simulator.runSlotContract()`, with breakpoints
  set via `toggleBreakpoint(lineNumber)` (C-line or asm-line depending on
  whether C source was attached).
- **Reset**: `node.reset()` (full) or `node.Simulator.reset()` (debug-state
  only).
- **Position is an assembly line index** — confirmed:
  `instructionPointer` indexes `asmCodeArr` (assembly split by `\n`), not a
  raw bytecode/memory address. `cToAsmMap[instructionPointer]` gives the
  corresponding C line when available.
- **Memory by variable name**: `dumpContractData().Memory` is
  `{varName, value, debugName?}[]`; `varName` values line up 1:1 with
  compiler's `getMachineCode().Memory` name list.
- **Registers**: `A`/`B`, each `[bigint,bigint,bigint,bigint]` (four 64-bit
  longs per 256-bit pseudo-register).
- **Balance**: `dumpContractData().balance` / `.previousBalance` /
  `.executionFee`; cross-account via `Blockchain.getBalanceFrom(id)`.
- **Emitted transactions**: `dumpContractData().enqueuedTX` (pending, this
  round) vs. `Blockchain.transactions` (committed, after next forge).
- **Status**: `running` / `stopped` / `finished` / `frozen` / `dead` booleans,
  plus `exception` / `ERR` for error detail.
- **Step count**: not directly exposed; derive from `executionFee /
  Constants.stepfee` or count calls yourself.

## 7. Surprises / deviations from established facts

1. **License field on npm registry says "Proprietary"** for
   `smartc-signum-simulator`, but the actual bundled `LICENSE` file and every
   source header say BSD-3-Clause. This is almost certainly a registry
   metadata omission by the publisher (no `license` field in the published
   `package.json`, or it defaults oddly), not an actual relicensing — verified
   by reading the LICENSE file contents directly. Worth flagging to
   deleterium/ohager but doesn't block using the package under BSD-3 terms as
   the bundled LICENSE file states.
2. **`SimNode.loadSmartContract` compiles C itself** — it does not accept
   pre-compiled assembly. For a debugger that already has `getAssemblyCode()`
   output from our own editor's compile step, use the lower-level
   `Blockchain.deployContract({asmSourceCode, cSourceCode})` +
   `Simulator.setCurrentSlotContract()` instead, which does take raw assembly
   directly exactly as originally assumed.
3. **`stepIntoSlotContract()` is a C-line step, not a single-asm-instruction
   step**, when a C source is attached. True single-instruction stepping is
   `contract.step()` on the underlying `CONTRACT` object. This matters for a
   debugger UI that wants to offer both "step one asm op" and "step one C
   statement".
4. **Breakpoint line numbers are ambiguous by design** — same
   `toggleBreakpoint(n)` call means "C source line" or "assembly line"
   depending on whether a C source was supplied at deploy time. Our debugger
   needs to track which mode is active (we'll always supply C source, so it's
   always C-line mode in practice — worth locking this down explicitly rather
   than relying on the length-based auto-detection).
5. **Transaction activation timing is off-by-one relative to intuition**: send
   the activation tx with `blockheight` equal to the *current* height (before
   forging), not the height you want it to land at. Confirmed by tracing
   `preForgeBlock()`'s `TX.blockheight === currentBlock - 1` check, which
   runs *after* `Blockchain.forgeBlock()` increments the counter inside the
   same `SimNode.forgeBlock()` call.

Nothing found contradicts the core claims that the engine runs assembly (not
bytecode), takes transactions as JSON, supports breakpoints + memory
inspection, and tracks contract status — all confirmed and demonstrated live.

## 8. Vendoring plan (deferred, not needed)

Not vendoring since the npm package is authoritative and sufficient. If a
future need arises to vendor (e.g. to patch engine behavior), the files to
copy from `github.com/deleterium/SC-Simulator` `src/` would be: `index.ts`
(SimNode + Constants), `simulator.ts` (SIMULATOR), `contract.ts` (CONTRACT),
`blockchain.ts` (BLOCKCHAIN), `cpu.ts` (instruction execution — largest file,
~1200 lines), `hashlib.ts` (SHA256/etc for hash opcodes), `objTypes.ts`,
`utils.ts`, `api.ts` (external function/opcode table). `try.js`/`try.html`
are UI-only and were not needed for headless driving — confirmed the engine
has zero DOM dependency.
