# Contract Inspector — Design

**Date:** 2026-09-30
**Status:** Approved (design), pending implementation plan
**Context:** Successor to the standalone `signum-contract-inspector` app, rebuilt
inside the Studio. This spec covers **Milestone 1 (foundation)**; later milestones
are listed in §10 and get their own specs.

---

## 1. Problem

Developers debug deployed contracts by reading their on-chain state: the data
stack (`machineData`, 8-byte slots) and the contract maps (`key1/key2 → value`).
The old inspector shows that state raw — slot indices and hex — and the developer
carries the meaning in their head: "slot 7 is the on-sale flag", "map key1 `10`
holds user permissions". Every session starts by re-deriving that mapping.

What the old tool offers (≈700 lines vanilla JS):

- look up a contract by id, or all contracts of a creator
- attributes (raw `getContract` fields)
- data stack as 8-byte tokens, each shown as hex / decimal / string / reversed string
- raw machine code
- map lookup by a manually typed `key1` (`getContractMapValuesByFirstKey`)
- deep links (`?address=…&testnet&node=…`)

## 2. Goal

Turn index-level inspection into **meaning-level inspection** inside the Studio:

- The primary use case is **debugging one's own deployed contracts**.
- The premise is that **source code is usually not available**. The user may still
  know things about the contract, so semantics must be addable **by hand**.
- When source *is* available, the semantics are **generated** from it.
- Both paths produce the same artifact: a **Label Map** file.

The inspector is **read-only**: it sends no transactions and needs no wallet.

## 3. Core concepts

### 3.1 Label Map (`*.labels.json`)

A project file that gives names, formats and meanings to a contract's memory
slots, map keys, values and (from M2) code addresses. It applies to **all
contracts whose machine-code hash is listed** in it. It is a list because the
same source built with different `#define`s, such as a per-network address
constant, keeps the structure but changes the hash.

A Label Map comes from three origins, tracked per entry:

- `manual`: set by the user in the inspector UI or the editor
- `compiler`: generated from a `.smart.c`
- `imported`: taken over from a file someone else published. It is treated like
  `manual` for merges.

### 3.2 Watchlist (`*.inspect.json`)

A project file listing the contracts to inspect, each with its network. Opening it
opens the inspector UI.

### 3.3 No special project kind

The Studio is file-centric: projects are folders, and what a project *is* follows
from its files (`contractOfProject`, the per-type editors in `files-page.tsx`).
Inspection files are **complementary** to a normal project:

- A development project gains `<name>.labels.json` and `deployments.inspect.json`
  next to its `.smart.c`.
- An "inspector project" is simply a folder that holds only inspection files.
  Inspecting without source is the same flow without generated labels.

Label Maps are resolved **across the whole workspace**, so a contract added in
any project picks up labels defined in any other.

## 4. File formats

All 64-bit identifiers, keys and values are stored as **decimal strings** (signed
64-bit does not fit a JS number; the node API uses strings too). Both files carry
`version: 1`, and parsers migrate by version.

### 4.1 Watchlist

```json
{
  "version": 1,
  "contracts": [
    {
      "id": "10904650711172151453",
      "network": "testnet",
      "alias": "NFT #42 (test)",
      "note": "Sale does not complete",
      "labelMap": "nft-market.labels.json"
    }
  ]
}
```

- `network` is `"mainnet"`, `"testnet"` or `{ "node": "https://…" }`.
- `alias`, `note` and `labelMap` are optional. `labelMap` is a workspace path and
  pins the map manually, overriding hash resolution.

### 4.2 Label Map

```json
{
  "version": 1,
  "name": "NFT Market",
  "codeHashes": [
    { "hash": "8421…", "network": "mainnet", "note": "#define OWNER S-…" },
    { "hash": "1337…", "network": "testnet" }
  ],
  "source": { "file": "nft-market.smart.c", "generatedAt": "2026-09-30T12:00:00Z" },
  "slots": [
    { "index": 7, "name": "isOnSale", "format": "enum", "enum": "saleStatus",
      "comment": "…", "origin": "manual" },
    { "index": 12, "name": "prices", "format": "long", "length": 5, "origin": "compiler" }
  ],
  "maps": [
    { "key1": "10", "name": "User Permissions",
      "key2Format": "address", "valueFormat": "enum", "enum": "permission",
      "origin": "manual" },
    { "key1Format": "address", "name": "Account Data",
      "key2": [
        { "key2": "1", "name": "balance", "valueFormat": "long" },
        { "key2": "2", "name": "lastClaim", "valueFormat": "long", "comment": "block height" }
      ],
      "origin": "manual" }
  ],
  "enums": {
    "saleStatus": { "0": "idle", "1": "on sale", "2": "sold" },
    "permission": { "1": "minter", "2": "admin" }
  },
  "codeLabels": [
    { "address": 420, "name": "sellNft", "origin": "compiler" }
  ]
}
```

**Formats:** `long` (signed), `unsigned`, `fixed` (SmartC fixed-point, 8
decimals), `hex`, `address` (`S-`/`TS-` by the contract's network), `string`
(little-endian bytes as text), `bool`, `enum` (requires `enum` naming a key in
`enums`).

**Slots:**
- `length > 1` groups consecutive slots into an array.
- Structs need no concept of their own: the compiler emits one named slot per
  member (`sale.price`, `sale.owner`).
- A slot without a label, or without a format, shows every interpretation, as the
  old tool did.

**Maps are grouped by key1.** An entry is one of two kinds:
- *fixed key1* (`key1` set): one concrete group
- *key1 pattern* (`key1Format` set, e.g. "every key1 is an account id"): the user
  supplies key1 at inspection time

Either kind may give `key2Format` (key2 is "any X") and/or a `key2` list of named
key2 entries, and each named key2 entry may set its own `valueFormat`/`enum`.

**`codeHashes[].network`** is informational only. Matching uses the hash alone.

**`codeLabels`** are part of the format now, so M2 (disassembly) needs no format
change. M1 generates them but does not display them.

## 5. Behaviour rules

### 5.1 Label Map resolution (`resolveLabelMap`)

1. If the watchlist entry pins `labelMap` and the file exists and parses, use it.
2. Otherwise collect every workspace `*.labels.json` whose `codeHashes` contain the
   contract's `machineCodeHashId`.
3. One match → use it. None → no labels. Several → the UI asks the user to choose
   and writes the choice into the watchlist entry as `labelMap`.

### 5.2 Generating from source (`merge-labels`)

- Compile the chosen `.smart.c`, produce slots, codeLabels and the hash.
- Replace every entry with `origin: "compiler"`. Keep `manual` and `imported`
  entries.
- Editing a `compiler` entry by hand turns it into `manual`.
- If a kept manual slot has the same index as a new compiler slot, the manual one
  wins and the UI lists the conflict.
- Add the compiled hash to `codeHashes` if it is missing (with the network, if
  known), and set `source`.

### 5.3 Compiler adapter

The public `getMachineCode()` gives only `Memory: string[]` (names in slot order)
and `Labels` with addresses. SmartC's internal `Program.memory` (`MEMORY_SLOT[]`)
also carries `declaration` (long / fixed / pointer), `size`, `scope`, `line` and
`typeDefinition`, which is enough for formats, arrays and struct members.

The adapter reads `Program.memory` behind one function and **falls back** to the
public `Memory` names, without types, if the internal shape is absent. The fallback
is reported to the UI as "types unavailable, names only". Compiler registers
(`r0…`) and constants that occupy no slot (`address === -1`) are skipped. This
matches `isInternalVar`.

## 6. Architecture

Everything lives under `apps/studio/src/features/inspector/`, in three layers.

### 6.1 Model (pure, fully unit-tested)

| Module | Responsibility |
|---|---|
| `watchlist.ts` | types, parse/validate (with error paths), migrate, serialize |
| `label-map.ts` | same for Label Maps |
| `resolve-label-map.ts` | §5.1 |
| `decode.ts` | `machineData` → slots; slot hex × format → display value |
| `merge-labels.ts` | §5.2, returns the merged map plus conflicts |

Validation is hand-written. The Studio has no schema library, and this spec adds
none.

### 6.2 Adapters

- `label-generator.ts`: SmartC → `{ slots, codeLabels, codeHash, typed: boolean }` (§5.3)
- `inspector-client.ts`: a signumjs `LedgerClient` per network, built without a
  wallet. It uses default node hosts for mainnet and testnet, or a custom node, and
  provides:
  - `getContract(id)`
  - `listByCreator(accountId, { codeHash? })`: `getContractsByAccount`, with no
    server paging, so paging happens on the client
  - `listByCodeHash(hash, page)`: `getAllContractIds` for the total, then
    `getAllContractsByCodeHash` with `firstIndex`/`lastIndex` (≤ 500 per page,
    `includeDetails: false`)
  - `getMapByKey1(id, key1, { value?, page })`: paged
  - `getMapValue(id, key1, key2)`
  - every list operation takes an `AbortSignal`

### 6.3 UI

**`InspectorEditor`** opens for `*.inspect.json`:
- *Left:* the watchlist. Each row shows alias or id, a network badge, a status
  badge (running / stopped / finished / frozen / dead) and a "no labels" hint.
  Above it sits "+ Contract".
- *Right:* `ContractView` with a refresh button (manual only in M1) and three tabs:
  - **Overview:** attributes, balance, status, code hash, the resolved Label Map.
    Actions: "add this hash to a Label Map…" and "create Label Map".
  - **Data stack:** a table of index, label, formatted value and raw hex, with an
    "only labelled" filter and a search. Selecting a row opens a detail panel with
    every interpretation and **Set / edit label**, which writes to the `.labels.json`.
  - **Maps:**
    - fixed groups show as expandable sections that load when expanded
    - pattern groups take a key1 input that matches their `key1Format`
    - a free key1 query stays available
    - values are formatted, rows are paged, and every row offers **Set label**

**`AddContractDialog`** has three tabs:
- *ID / address:* single contract
- *Creator:* includes "my wallet" when a wallet is connected, and an optional
  code-hash filter
- *Code hash*

The Creator and Code-hash tabs:
- render a virtualized, paged result list
- filter already loaded rows on the client by name, description, id, status and
  balance
- allow multi-select into the watchlist
- can be cancelled at any time and keep the rows already loaded

**`LabelMapEditor`** opens for `*.labels.json`:
- tabs *Slots*, *Maps*, *Enums* and *Code hashes*
- a toggle to raw JSON in Monaco
- **Generate from source…**: pick a `.smart.c`, compile, merge (§5.2), show the
  conflicts and the typed/fallback state

### 6.4 Integration points

- `filetype-icons.tsx`: add two `FileTypes` members, icons and `acceptedFileType`
  (`.inspect.json` and `.labels.json`, checked before any generic `.json` rule)
- `files-page.tsx`: dispatch the two new editors
- `new-project-dialog.tsx`: the existing `"inspect"` type creates
  `<name>.inspect.json` and opens it
- Deploy flow (`deployment-flow.tsx`, `large-contract-deployment.tsx`): an
  **Inspect** action after a successful deploy. Inside the development project it:
  - creates or updates `<contract>.labels.json`, generated from the project's
    `.smart.c`
  - adds the new contract to `deployments.inspect.json`, with the deploy's network
  - opens the watchlist
  - The contract appears once the chain lists it; until then the entry reads
    "pending", reusing `deployment-watch`.
- Workflow rail: in a folder with no contract (`contractOfProject` → null), the
  rail hides instead of showing empty compile/test/deploy cells.

## 7. Data flow

1. The watchlist entry gives the network; `inspectorClient(network).getContract(id)`
   fetches the contract.
2. Its `machineCodeHashId` goes to `resolveLabelMap` over the workspace's Label Maps.
   The workspace list is built once and rebuilt on `file:*` / `fs:reloaded`, so a
   label change shows at once in every open inspection, across tabs.
3. `decode(machineData, labelMap)` produces the slot rows. It is recomputed on
   refresh or on a label change and holds no state of its own.
4. Map groups load when expanded and are cached per (contract, key1, page) until
   refresh.
5. "Set label" writes through the file-system API. Step 2 does the re-render;
   there is no second copy of the state.

## 8. Error handling

| Situation | Behaviour |
|---|---|
| Node unreachable or timeout | error card in the contract pane with *Retry* and *Choose other node*; the watchlist stays usable |
| Unknown id or wrong network when adding | clear message; no entry is created |
| Existing entry no longer found | marked "not found", never removed automatically |
| Invalid `.inspect.json` / `.labels.json` | editor lists the validation errors with their paths and offers JSON mode; the file is never rewritten automatically |
| Several Label Maps match | the overview asks for a choice, which is stored in the watchlist |
| Label index beyond `machineData` | row marked "out of range", no exception |
| Compile error while generating | error shown, map unchanged |
| Adapter fallback | notice "types unavailable, names only" |
| Large search results | pages load in sequence and can be cancelled; loaded rows stay |

## 9. Testing (bun test)

- **Model:**
  - schema validation for valid and broken files
  - `decode` for every format, with edge cases: negative longs, `fixed` rounding,
    invalid UTF-8, address 0, `enum` without a match
  - `resolveLabelMap`: pinned, by hash, ambiguous, none, pinned-but-missing
  - `merge-labels`: manual kept, compiler replaced, conflict reported, hash added once
- **Label generator:** a real SmartC compile of `counter.smart.c` plus a new
  fixture with an array, a struct and `fixed`. It checks slots, formats,
  codeLabels and hash, and a test forces the fallback path.
- **Inspector client:** against a fake ledger (the pattern in
  `use-deployment-count`): paging, abort, error mapping.
- **UI:** two focused component tests: *set label → file updated → row shows the
  name*, and the add dialog's paging with cancel.
- **i18n:** a new `inspector` namespace in all ten locales per the i18n spec
  (complete `en`, consistency tests green).

## 10. Roadmap and out of scope for M1

| Milestone | Content |
|---|---|
| **M1** (this spec) | watchlist, contract selection (id / creator incl. wallet / code hash), overview, labelled data stack, labelled maps, Label Map format + editor + generation from source, Inspect-after-deploy |
| **M2** | disassembly of `machineCode` with slot and code labels, using the ASM definitions and hover docs |
| **M3** | state search across instances: filter by labelled slot and map values (e.g. `isOnSale == 1`), throttled fetch with progress and cancel, local IndexedDB index updated incrementally, map value filter via the API's `value` parameter |
| later | live polling and slot diff, transaction and message history, time travel by replaying chain history in the simulator, per-instance overrides, deep links |
