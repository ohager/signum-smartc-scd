# Carbon Contracts — Design

**Date:** 2026-11-06
**Status:** Approved (design), pending implementation plan
**Context:** Sub-project 2 of the AI Assistant roadmap
(`2026-11-06-ai-assistant-design.md` §3), pulled ahead of R1. It is a Studio
feature in its own right and does not depend on the assistant. The assistant's
sandbox phase (sub-project 3) builds on it.

---

## 1. Problem

Signum can deploy a contract **by reference** — a "carbon" (or "green") contract:
the new contract reuses the code of an existing deployment and brings only its own
initial data stack. It relates to the original like an object to its class, and it
is much cheaper than deploying the code again.

The Studio cannot do this. Worse, it cannot set deploy parameters at all:
`deployment-view/data-initialization.tsx` is an empty stub and `deployment-view.tsx`
passes `initialData={[]}` to the deploy flow. Every contract is deployed with an
all-zero data stack, so deployer-set values (owner, fees, linked contract ids) need
a recompile with different constants — which changes the code hash.

## 2. Goal

- When a contract with the project's current code hash exists on the connected
  network, the deploy page offers **deploy by reference** next to the full deploy.
- From the inspector, any watched contract can be the original for a **new
  instance** — without source.
- Both deploy paths get a **parameter form**. The parameters come from the SmartC
  source and/or the Label Map.
- The user signs, always. Nothing here deploys without the user's wallet.

## 3. Key facts

**What the reference transaction carries.** `publishContractByReference` in
`@signumjs/core` 3.3.4 sends `referencedTransactionFullHash`, `name`,
`description` and `data`. Code, data pages, code and user stack pages and the
minimum activation amount (`code`, `dpages`, `cspages`, `uspages`,
`minActivationAmountNQT`) are **not** sent; the instance inherits them from the
original. For a reference deploy the activation amount is therefore shown, not
editable.

**What counts as an original.** A contract's id is the id of its deploy
transaction. If that transaction has a `referencedTransactionFullHash`, the
contract is an instance, and that hash points at the original's deploy
transaction (`getTransactionByFullHash`). Otherwise the contract is itself an
original, and the reference is its own transaction's `fullHash`. One step is
always enough: the node rejects a reference to an instance ("Invalid reference
transaction for the AT code"), because the referenced creation bytes must contain
code (`TransactionType.java`, AT creation validation).

**Pages and fee come from the original.** The node's `createATProgram` copies
version, data, code-stack and user-stack pages and the minimum activation amount
from the referenced creation bytes, and validation requires them to match. The
minimum fee is `(dataPages + callStackPages + userStackPages) × costPerPage`, with
no code pages; `costPerPage` is 10 000 000 planck (0.1 SIGNA) at AT version 3. The
original's creation bytes (header: version, reserved, code, data, code-stack and
user-stack pages, minimum activation) give pages, data capacity and fee.

**Initial data is contiguous.** `data` is written from slot 0 upwards. Setting slot
7 means sending slots 0–7.

**Top-level code runs at first activation.** Code before `main()` — global
initialisers like `long fee = 5;` and assignments in the init section — runs when
the contract first activates and overwrites whatever the deployment put into those
slots. A deploy parameter is therefore a variable that top-level code does not write.

**Existing building blocks.** `MachineData.MachineCodeHashId` (the compiled code
hash), `InspectorClient` with `getAllContractsByCodeHash`, the Label Map with its
resolution by code hash, the label generator with typed slots from the compiler,
`decode.ts` for value formats, the deploy flow (unsigned transaction → XT Wallet),
and "inspect after deploying".

## 4. Flow and UI

### Finding originals

`findReferences(codeHash, node)`:

- Asks the node XT Wallet is connected to, via `getAllContractsByCodeHash`.
- For each hit, loads the deploy transaction. An instance (one with
  `referencedTransactionFullHash`) is traced to its original through that hash, so
  the original is found even when it is not among the hits. Originals are
  de-duplicated.
- **Preselection:** a contract deployed by the connected account, otherwise the
  oldest. The user can switch (contract id, creator, date).

### Deploy page (project with source)

- After a compile, the search runs in the background.
- With hits, the page shows **two paths** side by side: **Full deploy** (as today)
  and **Deploy by reference**, with both fees shown and the chosen original.
- Without hits, the full deploy stays as it is, with a short note: "Once this code is
  on chain, you can deploy more instances cheaply by reference."
- A code change changes the hash; the search reruns and old hits disappear. The
  deploy button always uses the result for the current hash.

### Inspector (no source)

- Every contract in a watchlist gets **New instance**, which opens the same deploy
  dialog with that contract as the original.
- The inspector stays read-only, as its spec requires: the button hands over to the
  deploy flow, which owns the wallet connection and signing.
- Parameters come from the Label Map resolved for that code hash. If there is none,
  or it has no parameters, the dialog lets the user mark slots as parameters, which
  writes `param: true` into the Label Map through the same edit path as "Set label".

### Parameter form (both deploy paths)

- One field per parameter: label, description (the slot's `comment`) and an input
  matching its format — address (`S-…` or numeric id), long, fixed (decimal), text
  (up to 8 bytes), bool, enum (select), hex.
- Name and description are prefilled from `#program`, or from the original, and are
  editable. The activation amount is editable on the full deploy only.
- A **data stack preview** lists slot, name, value and hex of exactly what will be
  sent. Internal slots (registers, compiler constants) and non-parameter slots below
  the highest parameter are greyed out with value 0 (or their `default`).

### After deploying

As today: "inspect after deploying" adds the new contract to the project's watchlist
in one click. The same Label Map applies automatically, since the code hash is the same.

## 5. Label Map and generator

### Schema extension

Additive; `version` stays 1. `SlotLabelSchema` gains two optional fields:

```jsonc
{ "index": 3, "name": "owner", "format": "address",
  "param": true,                 // appears in the deploy form
  "default": "0",                // optional: raw 64-bit value as a decimal string
  "comment": "Contract owner",   // the form's field description
  "origin": "compiler" }
```

- Validation: `param` on an array entry (`length > 1`) or on an array pointer is an
  error. Parameters are single slots; struct members are single slots and allowed.
- `param` and `default` follow the existing merge rules: generated entries carry
  `origin: "compiler"`; a user edit makes the entry `manual`, and regeneration keeps it.
- `strictObject` means an older Studio would reject the new fields. Studio is a web
  app with one live version, so this is acceptable.

### Generator

`generateLabels` additionally:

- **Suggests parameters:** inside `#ifdef TESTBED … #endif` blocks, every
  `const <name> = TESTBED_<x>;` marks the slot of `<name>` as `param: true` — the
  convention of the `signum-smartc` skill.
- **Suggests formats:** `fixed` from the compiler type; `address` for names matching
  `owner`, `admin`, `creator`, `*Account`, `*Address` or `*Id`; otherwise `long`.
  These are suggestions with `origin: "compiler"`.
- Never marks registers (`r0…`), compiler constants (`n32`, `f100000000`, …), arrays
  or array pointers as parameters.

### Encoding

`features/inspector/model/encode.ts`, the inverse of `decode.ts`:

| Format | Input → 64-bit value |
|---|---|
| `address` | `S-…` (Reed-Solomon) or numeric id → unsigned |
| `long` | signed decimal |
| `unsigned` | unsigned decimal |
| `fixed` | decimal × 10⁸, at most 8 decimal places |
| `hex` | up to 16 hex digits |
| `string` | up to 8 bytes UTF-8, little-endian |
| `bool` | 0 / 1 |
| `enum` | the selected key |

### Overwrite detection

`findOverwrittenParams(assembly, params)` scans the compiler's assembly **before
the `__fn_main` label** for writes to parameter slots and returns, per parameter,
the source line of the write. The form shows a warning on the field: "Overwritten
by line N on first activation". Without source (inspector) there is no assembly to
scan; the form says so. The check follows once the inspector's own disassembler
(inspector M2) exists. The same detection becomes lint rule 8 of the AI Assistant R1.

## 6. Error handling

- **No wallet connected:** the search needs the node XT is connected to. The deploy
  page says "Connect XT Wallet to find existing deployments of this code"; the full
  deploy works as today.
- **Search fails** (node unreachable, timeout): nothing is blocked. A quiet note with
  **Search again**; full deploy stays available.
- **Code changes after the search:** new hash, new search (§4).
- **Overwritten parameter:** warning on the field; deploying requires confirming
  "I know this value will be overwritten". Not a hard block — conditional
  assignments exist.
- **Invalid input** (unparsable address, text over 8 bytes, number outside 64 bits,
  more decimals than `fixed` holds): error on the field, deploy disabled.
- **Data larger than the inherited data pages:** error in the form, deploy disabled.
- **Signing declined, broadcast errors:** handled as in today's deploy flow.
- All new UI text goes through the i18n flow into all nine locales.

## 7. Spike (first task of the plan, on the local sandbox with XT Wallet)

1. Does an instance inherit pages and activation amount as expected, and does its
   data arrive in the right slots?
2. Confirm that the node rejects a reference to an instance (expected from the node
   source, §3).
3. Confirm the minimum fee formula from §3 (accepted at the formula value, refused
   one planck below).
4. Does XT Wallet sign the unsigned reference transaction without trouble?

The results go into the plan. Items 2 and 3 are answered by the node source; the
spike only confirms them.

## 8. Testing

All with `bun test`, following the existing patterns.

- `encode.ts`: round-trip against `decode.ts` for every format, plus limits.
- Generator: fixtures for TESTBED detection and format suggestions; no parameters on
  arrays, registers or constants.
- Overwrite detection: fixtures with a global initialiser, an assignment in init code,
  and a clean contract.
- Form model, as a pure function: Label Map + inputs → fields, errors and
  `ContractData[]` (contiguous, internal slots 0).
- Original selection: own before oldest, instances traced to their original.
- Deploy flow with a fake ledger: `referencedTransactionFullHash` and `data` are set,
  no code is sent.
- Schema: `param` on an array is invalid; merge rules for `param` / `default`.
- **Acceptance** (manual, on the sandbox with XT): deploy an original in full, then two
  instances by reference with different parameters — one from the deploy page, one
  from the inspector — and confirm in the inspector that the values sit in the right
  slots.

## 9. Out of scope

- Parameter overwrite checks without source (with inspector M2).
- Array parameters.
- Deploying several instances at once.
- Assistant tools for reference deploys (AI Assistant sub-project 3).
