# Carbon Contracts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deploy contracts by reference ("carbon contracts") from the deploy page and from the inspector, and give both deploy paths a parameter form that fills the initial data stack.

**Architecture:** A pure model layer — value encoding, parameter selection, data-stack building, overwrite detection, reference search and deploy-request building — sits under two thin UI entry points: the existing `DeploymentView` (project with source) and a new instance dialog in the inspector (no source). Parameters come from the Label Map (`param: true`) and, with source, from the generator's TESTBED-convention suggestions. Signing always goes through XT Wallet via the existing deployment flow.

**Tech Stack:** React 19, Tailwind 4, jotai, `smartc-signum-compiler@2.3.0`, `@signumjs/core@3.3.4` (`publishContractByReference`), `@signumjs/contracts@3.3.4` (`generateDataStack`), Zod 4, Bun test.

**Spec:** `docs/superpowers/specs/2026-11-06-carbon-contracts-design.md`

## Global Constraints

- All paths are relative to `apps/studio/` unless they start with `docs/`.
- Run `bun install` at the repo root once before Task 2 if `apps/studio/node_modules` is missing (tests fail with "Cannot find module '@signumjs/core'" otherwise).
- Run tests from `apps/studio/`: `cd apps/studio && bun test <path>`.
- **Typecheck** (the repo is not type-clean as a whole, so only touched paths are checked, as in earlier plans): `cd apps/studio && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/(deployment|inspector|asm-editor)|pages/deploy" || echo clean` — expected output `clean`.
- 64-bit values are `bigint` in code and **unsigned decimal strings** in files and in `ContractData[]` (`BigInt.asUintN(64, raw).toString()`); never `number`.
- The user signs every deployment through XT Wallet. No code path in this plan reads, stores or asks for a passphrase.
- The inspector stays read-only: its "New instance" button only opens the deploy dialog, which owns wallet and signing.
- Label Map changes keep `version: 1`, are additive, and go through the comment-preserving edits in `features/inspector/model/label-map-edits.ts` / `workspace/update-file.ts`.
- Every user-visible string goes through `t()` from `@/i18n/runtime`. New English keys live in `src/i18n/locales/en/asm-editor.json` under `"params"` and `"reference"` (deploy side) and in `inspector.json` under `"instance"` (inspector side). Run `bun run i18n:types` after changing them. Code terms that are not prose get `// i18n-ignore`.
- Match surrounding code: block comments explain *why*, named exports, `@/` imports, collaborators injected so models test without a browser.
- Commit after every task with a conventional message ending in
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Decisions taken while planning

1. **Instances are traced to their original, one step.** A contract id is its deploy transaction id. If that transaction has `referencedTransactionFullHash`, the contract is an instance and `getTransactionByFullHash(that hash)` is the original's deploy transaction; otherwise the transaction is the original. One step suffices: the node rejects referencing an instance (spec §3). `findReferences` and the inspector dialog share `traceOriginal` (Task 7). A traced transaction that is not an AT creation (`type !== 22 || subtype !== 0`) or itself carries a reference is dropped.
2. **Array-pointer check lives in the parameter model, not the schema.** The Label Map does not mark pointers structurally (only by the generator's comment), so the schema rejects `param` with `length > 1`, and `paramSlots` additionally drops indexes the generator reports as array pointers.
3. **Search breadth:** `findReferences` looks at the first 25 hits for the code hash and loads their deploy transactions with at most 5 requests in flight. Any one valid original is enough to deploy.
4. **Empty parameter field** means the slot's `default`, or 0. Parameters are not required.
5. **Data capacity:** a project's capacity is `DataPages * 32` slots (256-byte pages, 8-byte slots); an on-chain original's is `header.dataPages * 32`, from its creation bytes (Task 7).
6. **Overwrite detection** compiles once more with `#pragma verboseAssembly true` appended to the source. The appended pragma overrides an earlier `false`, emits no bytes and shifts no lines (checked against the compiler while planning). Top-level code is everything before the first `PCS` line or `__fn_main:` label.
7. **Reference deploy fee** is computed, not a constant: `max((dataPages + callStackPages + userStackPages) * 10_000_000n, 1_000_000n)` planck (AT v3 `costPerPage`; code pages are 0 for a reference; the floor is the generic minimum fee). Task 1 confirms it.

## Review Focus

1. **A parameter at a high slot index** (e.g. after an array) — the data array must contain every slot from 0 up to it, with non-parameter slots at their `default` or 0, and must be rejected when it exceeds capacity. *Pinned in Task 6 (`fills gaps up to the highest parameter`, `rejects data beyond capacity`).*
2. **Negative and boundary values** (`-1`, `2^63`, `2^64-1`, `-2^63`) must reach the chain as the same 64 bits the inspector later decodes. *Pinned in Task 3 (`round-trips through formatValue` and `generateDataStack sees unsigned decimals`).*
3. **The code changes while a reference search is running** — the old result must never show for the new hash. *Pinned in Task 7 (`aborted search resolves to nothing`) and wired in Task 10.*
4. **XT Wallet connected to another network than the inspected contract** — the instance dialog must refuse with a clear message instead of referencing a hash the node does not know. *Pinned in Task 11 (`resolveInstanceReference` rejects a missing or different contract).*
5. **A contract that already sets `#pragma verboseAssembly false`, or uses functions** — overwrite detection must still find writes before `main` and none after. *Pinned in Task 5 fixtures.*

---

## File Structure

```
apps/studio/src/features/
  inspector/
    model/label-map.ts            MODIFY  SlotLabelSchema: param, default; length>1 rule
    model/encode.ts               CREATE  encodeValue, toContractData
    compiler/label-generator.ts   MODIFY  testbedParams, suggestFormat, used by generateLabels
    chain/inspector-client.ts     MODIFY  export classifyNodeError
    ui/contract-view.tsx          MODIFY  "New instance" button
    ui/inspector-editor.tsx       MODIFY  append deployed instance to the watchlist
    ui/instance-deploy-dialog.tsx CREATE  dialog: reference, params, mark slots, deploy flow
    instance/instance-reference.ts CREATE resolveInstanceReference
  deployment/
    overwritten-params.ts         CREATE  compileVerbose, findOverwrittenParams
    deploy-params.ts              CREATE  paramSlots, buildDataStack
    reference-search.ts           CREATE  findReferences, pickReference
    deploy-request.ts             CREATE  DeployRequest, buildUnsignedDeploy, referenceDeployMinFeePlanck
    use-reference-search.ts       CREATE  React hook over findReferences
    ui/parameter-form.tsx         CREATE
    ui/data-stack-preview.tsx     CREATE
    ui/reference-picker.tsx       CREATE
  asm-editor/deployment-view/
    deployment-flow.tsx           MODIFY  takes a DeployRequest
    large-contract-deployment.tsx MODIFY  data from the request
    deployment-view.tsx           MODIFY  two paths, params, activation amount, name/description
    data-initialization.tsx       DELETE  (empty stub)
  pages/deploy/deploy-page.tsx    MODIFY  passes source to DeploymentView
docs/superpowers/notes/carbon-contracts-spike.md   CREATE (Task 1)
```

---

### Task 1: Spike on the local sandbox

Answers spec §7 item 1 and confirms items 2–3 (known from the node source) with a throwaway script; item 4 (XT signing) is answered in Task 12's acceptance run. **Needs the user:** a running Signum Sandbox on `localhost:6876` and the passphrase of a funded sandbox account (the user's forging account works), passed as an environment variable. The script is not committed.

**Files:**
- Create: `docs/superpowers/notes/carbon-contracts-spike.md`
- Scratch (not committed): `<scratchpad>/carbon-spike.ts`

**Interfaces:**
- Produces: confirmation of the fee formula (Decision 7) used in Task 8, of the creation-bytes header layout used in Task 7, and that `Transaction.referencedTransactionFullHash` marks an instance's deploy transaction.

- [ ] **Step 1: Ask the user** to start the sandbox and provide `SANDBOX_PASSPHRASE` (run as `! SANDBOX_PASSPHRASE='…' bun <script>` so it never lands in a file). Confirm `curl -s 'http://localhost:6876/api?requestType=getConstants' | jq -r .networkName` prints `Signum-LOCAL-MOCK`.

- [ ] **Step 2: Write the script** (run from `apps/studio/` so modules resolve). It compiles a contract with three `long` globals without initialisers, deploys it in full with `publishContract` (`data: []`), waits for a block, then deploys an instance with `publishContractByReference({ referencedTransactionFullHash: <original fullHash>, data: ["7", "18446744073709551615", "3"], name, description, feePlanck, senderPublicKey, senderPrivateKey })`, first with the Decision 7 fee minus 1 planck (expect refusal), then with the Decision 7 fee (expect acceptance). Finally it references the *instance's* full hash once (expect "Invalid reference transaction for the AT code").

- [ ] **Step 3: Run it and record** in the notes file:
  1. instance `machineData` slots 0–2 and the inherited `minActivation`, data pages (from `getContract`) vs. the original's;
  2. the node's answer to referencing the instance, and `referencedTransactionFullHash` on `getTransaction(instanceId)` vs. `getTransaction(originalId)`;
  3. both fee attempts, and `parseCreationHeader(original.attachment.creationBytes)` against `getContract`.
  If 2 or 3 differs from the expectation, stop and adjust Decisions 1/7 with the user before Task 7.

- [ ] **Step 4: Commit the notes**

```bash
git add docs/superpowers/notes/carbon-contracts-spike.md
git commit -m "docs(carbon): sandbox spike results for deploy by reference"
```

If item 1 shows the data does **not** arrive or pages are **not** inherited, stop and report to the user before Task 2: the spec's premise is wrong.

---

### Task 2: Label Map `param` and `default`

**Files:**
- Modify: `src/features/inspector/model/label-map.ts` (`SlotLabelSchema`, `superRefine`)
- Modify: `src/i18n/locales/en/inspector.json` (validation message)
- Test: `src/features/inspector/model/label-map.test.ts`, `src/features/inspector/model/merge-labels.test.ts`

**Interfaces:**
- Produces: `SlotLabel` gains `param?: boolean` and `default?: string` (signed decimal, `Decimal` schema).

- [ ] **Step 1: Write the failing tests**

```ts
it("accepts param and default on a slot", () => {
  const r = parseLabelMap(mapWith({ index: 3, name: "owner", format: "address", param: true, default: "0" }));
  expect(r.ok && r.value.slots[0]).toMatchObject({ param: true, default: "0" });
});
it("rejects param on an array entry", () => {
  const r = parseLabelMap(mapWith({ index: 4, name: "prices", length: 3, param: true }));
  expect(r.ok).toBe(false);
  if (!r.ok) expect(r.errors[0]!.path).toEqual(["slots", 0, "param"]);
});
it("rejects a non-decimal default", () => {
  expect(parseLabelMap(mapWith({ index: 1, name: "fee", default: "0x10" })).ok).toBe(false);
});
```

and in `merge-labels.test.ts`:

```ts
it("keeps a manual param entry and replaces compiler param suggestions", () => {
  // existing: slot 1 manual {param: true}, slot 2 compiler {param: true}
  // generated: slot 1 and slot 2 without param
  // expect: slot 1 still manual with param true; slot 2 from generated (no param)
});
```

`mapWith(slot)` is a local helper returning a minimal valid Label Map JSON string with that one slot.

- [ ] **Step 2: Run** `bun test src/features/inspector/model/label-map.test.ts src/features/inspector/model/merge-labels.test.ts` — expect the three new schema tests to FAIL (unknown keys under `strictObject`).

- [ ] **Step 3: Implement** — add `param: z.boolean().optional().describe("Shown in the deploy form")` and `default: Decimal.optional().describe("Value when the deploy form field is left empty")` to `SlotLabelSchema`; in `superRefine`, add an issue at `["slots", i, "param"]` with `t("inspector.validation.paramOnArray")` when `param && (length ?? 1) > 1`. English text: `"A deploy parameter must be a single slot, not an array"`.

- [ ] **Step 4: Run** the same tests plus `bun run i18n:types` — expect PASS. The merge test should pass without code changes (origin rules already cover it); if it does not, fix `mergeGenerated`, not the test.

- [ ] **Step 5: Commit** — `feat(carbon): Label Map slots can be deploy parameters`

---

### Task 3: Value encoding

**Files:**
- Create: `src/features/inspector/model/encode.ts`
- Test: `src/features/inspector/model/encode.test.ts`

**Interfaces:**
- Consumes: `formatValue`, `FormatContext` from `./decode`; `ValueFormat` from `./formats`.
- Produces:
  - `type EncodeError = "invalid" | "outOfRange" | "tooLong" | "tooManyDecimals" | "unknownEnum"`
  - `encodeValue(input: string, format: ValueFormat, ctx: FormatContext): { ok: true; raw: bigint } | { ok: false; error: EncodeError }` — `raw` is unsigned 64-bit.
  - `toContractData(raw: bigint): string` — unsigned decimal string.

- [ ] **Step 1: Write the failing tests**

```ts
const ctx = { prefix: "S" as const, enums: { State: { "0": "Idle", "1": "Open" } }, enumName: "State" };
const cases: [ValueFormat, string][] = [
  ["long", "-1"], ["long", "9223372036854775807"], ["long", "-9223372036854775808"],
  ["unsigned", "18446744073709551615"], ["fixed", "2.5"], ["fixed", "-0.00000001"],
  ["hex", "0x00000000000000ff"], ["string", "Hello"], ["bool", "true"], ["enum", "Open"],
  ["address", "S-2222-2222-2222-22222"], ["address", "0"],
];
it.each(cases)("round-trips through formatValue: %s %s", (format, input) => {
  const r = encodeValue(input, format, ctx);
  if (!r.ok) throw new Error(r.error);
  expect(encodeValue(formatValue(r.raw, format, ctx).replace(/ \(-?\d+\)$/, ""), format, ctx)).toEqual(r);
});
it("accepts a numeric id for address", () =>
  expect(encodeValue("1234567890", "address", ctx)).toEqual({ ok: true, raw: 1234567890n }));
it("rejects", () => {
  expect(encodeValue("abc", "long", ctx)).toEqual({ ok: false, error: "invalid" });
  expect(encodeValue("18446744073709551616", "unsigned", ctx)).toEqual({ ok: false, error: "outOfRange" });
  expect(encodeValue("123456789", "string", ctx)).toEqual({ ok: false, error: "tooLong" });
  expect(encodeValue("1.123456789", "fixed", ctx)).toEqual({ ok: false, error: "tooManyDecimals" });
  expect(encodeValue("Closed", "enum", ctx)).toEqual({ ok: false, error: "unknownEnum" });
});
it("generateDataStack sees unsigned decimals", () => {
  const minusOne = encodeValue("-1", "long", ctx);
  if (!minusOne.ok) throw new Error();
  expect(generateDataStack([toContractData(minusOne.raw), "1"])).toBe("ffffffffffffffff" + "0100000000000000");
});
```

(`generateDataStack` from `@signumjs/contracts`.)

- [ ] **Step 2: Run** `bun test src/features/inspector/model/encode.test.ts` — FAIL (module missing).

- [ ] **Step 3: Implement** `encodeValue` and `toContractData`. Ranges: `long` and `fixed` (after scaling) `-2^63 … 2^63-1`; `unsigned`, `hex` and `address` `0 … 2^64-1`; anything outside is `outOfRange`. `fixed` multiplies by `10^8` with exact decimal string arithmetic (no floats). `string` encodes UTF-8 bytes little-endian (byte 0 lowest), at most 8 bytes. `bool` accepts `true/false/1/0`. `enum` accepts the label or its numeric key. `address` uses `Address.fromReedSolomonAddress(...).getNumericId()` from `@signumjs/core` for `S-`/`TS-` input, else a decimal id.

- [ ] **Step 4: Run** the test — PASS.

- [ ] **Step 5: Commit** — `feat(carbon): encode form values into 64-bit slots`

---

### Task 4: Generator suggests parameters and formats

**Files:**
- Modify: `src/features/inspector/compiler/label-generator.ts`
- Modify: `src/features/inspector/compiler/__fixtures__/typed.smart.c` only if it lacks a TESTBED block; otherwise create `__fixtures__/params.smart.c`
- Test: `src/features/inspector/compiler/label-generator.test.ts`

**Interfaces:**
- Produces:
  - `testbedParams(source: string): Set<string>` — variable names assigned `TESTBED_*` constants inside `#ifdef TESTBED` blocks.
  - `suggestFormat(name: string, compilerFormat: ValueFormat | undefined): ValueFormat | undefined`
  - `generateLabels` slots carry `param: true` for TESTBED variables and the suggested format.

- [ ] **Step 1: Write the fixture** `__fixtures__/params.smart.c`: globals `long owner; long feeAccount; long tokenId; long maxSupply; fixed rate; long prices[3];` (no initialisers), a block

```c
#ifdef TESTBED
    const owner = TESTBED_owner;
    const maxSupply = TESTBED_maxSupply;
#else
    const rate = 2.5;
#endif
```

and a trivial `main`.

- [ ] **Step 2: Write the failing tests**

```ts
it("marks TESTBED-convention variables as parameters", () => {
  const r = generateLabels(params); if (!r.ok) throw new Error(r.error.message);
  const by = Object.fromEntries(r.labels.slots.map((s) => [s.name, s]));
  expect(by.owner).toMatchObject({ param: true, format: "address" });
  expect(by.maxSupply).toMatchObject({ param: true, format: "long" });
  expect(by.rate?.param).toBeUndefined();          // the #else branch is not TESTBED
  expect(by.feeAccount).toMatchObject({ format: "address" });
  expect(by.tokenId).toMatchObject({ format: "address" });
  expect(by.rate).toMatchObject({ format: "fixed" });
  expect(r.labels.slots.filter((s) => s.name === "prices").every((s) => !s.param)).toBe(true);
});
it("testbedParams ignores commented and #else lines", () => {
  expect([...testbedParams("#ifdef TESTBED\n// const a = TESTBED_a;\nconst b = TESTBED_b;\n#else\nconst c = TESTBED_c;\n#endif")]).toEqual(["b"]);
});
```

- [ ] **Step 3: Run** `bun test src/features/inspector/compiler/label-generator.test.ts` — FAIL.

- [ ] **Step 4: Implement.** `testbedParams` walks lines, tracking whether it is between `#ifdef TESTBED` and the matching `#else`/`#endif`, strips `//` comments, matches `/^\s*const\s+(\w+)\s*=\s*TESTBED_\w+\s*;/`. `suggestFormat` returns `"address"` when `compilerFormat === "long"` and the name matches `/^(owner|admin|creator)$/i` or `/(Account|Address|Id)$/`; otherwise `compilerFormat`. In `generateLabels`, map slots: top-level (no `.` in name), not arrays (`length` unset and comment ≠ `"array pointer"`), name in `testbedParams(source)` → `param: true`; apply `suggestFormat` to every slot.

- [ ] **Step 5: Run** the generator tests — PASS (existing ones too).

- [ ] **Step 6: Commit** — `feat(carbon): label generator suggests deploy parameters and address formats`

---

### Task 5: Overwrite detection

**Files:**
- Create: `src/features/deployment/overwritten-params.ts`
- Test: `src/features/deployment/overwritten-params.test.ts`

**Interfaces:**
- Produces:
  - `compileVerbose(source: string): { assembly: string; memory: string[] } | null` — `null` when the source does not compile.
  - `interface Overwrite { index: number; line: number }`
  - `findOverwrittenParams(assembly: string, memory: string[], paramIndexes: number[]): Overwrite[]` — one entry per overwritten parameter, the first writing line.

- [ ] **Step 1: Write the failing tests** (sources inline):

```ts
const src = (body: string) => `long owner;\nlong fee = 5;\nlong counter;\nlong rate;\n${body}\nvoid main() { counter++; rate = 1; sendAmount(fee, owner); }\n`;
const detect = (source: string, names: string[]) => {
  const v = compileVerbose(source)!; return findOverwrittenParams(v.assembly, v.memory, names.map((n) => v.memory.indexOf(n)));
};
it("finds a global initialiser", () =>
  expect(detect(src(""), ["fee"])).toEqual([{ index: 4, line: 2 }]));       // r0–r2 occupy 0–2, owner 3, fee 4
it("finds an assignment and a conditional assignment in init code", () =>
  expect(detect(src("rate = 7;\nif (counter == 0) { owner = 1; }"), ["rate", "owner"]).map((o) => o.line)).toEqual([5, 6]));
it("ignores writes inside main and in functions", () =>
  expect(detect(src("") + "void helper() { owner = 2; }\n", ["owner", "rate"])).toEqual([]));
it("works when the source disables verbose assembly", () =>
  expect(detect("#pragma verboseAssembly false\n" + src(""), ["fee"])).toEqual([{ index: 4, line: 3 }]));
it("returns null for a source that does not compile", () => expect(compileVerbose("long x = ;")).toBeNull());
```

Compute the expected indexes from `memory` in the test if the register count differs; the line numbers are fixed by the sources.

- [ ] **Step 2: Run** `bun test src/features/deployment/overwritten-params.test.ts` — FAIL.

- [ ] **Step 3: Implement.** `compileVerbose` appends `"\n#pragma verboseAssembly true\n"`, compiles with `SmartC`, returns `getAssemblyCode()` and `getMachineCode().Memory`. `findOverwrittenParams` scans lines until the first trimmed line equal to `PCS` or `__fn_main:`; tracks the last `^comment line N`; an instruction writes slot *i* when its first operand is `@` + `memory[i]` (mnemonic, then whitespace, then `@name` as the first token — e.g. `SET @fee #…`, `CLR @owner`, `INC @x`, `FUN @x get_…`, `POP @x`).

- [ ] **Step 4: Run** the test — PASS.

- [ ] **Step 5: Commit** — `feat(carbon): detect deploy parameters overwritten by top-level code`

---

### Task 6: Parameter model and data stack

**Files:**
- Create: `src/features/deployment/deploy-params.ts`
- Test: `src/features/deployment/deploy-params.test.ts`

**Interfaces:**
- Consumes: `SlotLabel`, `LabelMap` (Task 2); `encodeValue`, `toContractData`, `EncodeError` (Task 3); `FormatContext` from `inspector/model/decode`.
- Produces:
  - `paramSlots(generated: SlotLabel[] | null, map: LabelMap | null): SlotLabel[]` — map entries win per index; only `param === true`; drops `length > 1` and indexes where `generated` has an `"array pointer"` entry; sorted by index.
  - `interface FieldState { slot: SlotLabel; raw: bigint; error?: EncodeError }`
  - `type RowKind = "param" | "internal" | "filler"`
  - `interface PreviewRow { index: number; name?: string; raw: bigint; kind: RowKind }`
  - `interface DataStackResult { fields: FieldState[]; rows: PreviewRow[]; data: string[] | null; tooLarge: boolean }`
  - `buildDataStack(args: { params: SlotLabel[]; values: Record<number, string>; ctx: Omit<FormatContext, "enumName">; capacity: number; memory?: string[]; labels?: SlotLabel[] }): DataStackResult`

- [ ] **Step 1: Write the failing tests**

```ts
const p = (index: number, extra: Partial<SlotLabel> = {}): SlotLabel => ({ index, name: `p${index}`, format: "long", param: true, ...extra });
it("paramSlots: map wins, pointers and arrays dropped", () => {
  const generated = [p(3), { index: 5, name: "arr", comment: "array pointer", param: true } as SlotLabel, p(6, { length: 2 })];
  const map = { ...emptyMap, slots: [p(3, { name: "owner", format: "address" }), { index: 7, name: "fee", format: "long" } as SlotLabel] };
  expect(paramSlots(generated, map).map((s) => s.name)).toEqual(["owner"]);
});
it("fills gaps up to the highest parameter", () => {
  const r = buildDataStack({ params: [p(1), p(4, { default: "9" })], values: { 1: "-1" }, ctx, capacity: 32, memory: ["r0", "x", "y", "n32", "z"] });
  expect(r.data).toEqual(["0", "18446744073709551615", "0", "0", "9"]);
  expect(r.rows.map((x) => x.kind)).toEqual(["internal", "param", "filler", "internal", "param"]);
});
it("no parameters means no data", () =>
  expect(buildDataStack({ params: [], values: {}, ctx, capacity: 32 }).data).toEqual([]));
it("a field error blocks the data", () => {
  const r = buildDataStack({ params: [p(0)], values: { 0: "x" }, ctx, capacity: 32 });
  expect(r.data).toBeNull(); expect(r.fields[0]!.error).toBe("invalid");
});
it("rejects data beyond capacity", () => {
  const r = buildDataStack({ params: [p(40)], values: {}, ctx, capacity: 32 });
  expect(r.tooLarge).toBe(true); expect(r.data).toBeNull();
});
```

`labels` (all slot labels of the map/generator) name filler rows in the preview; `memory` marks registers (`/^r\d+$/`) and compiler constants (`/^[fn]\d+$/`) as `internal`.

- [ ] **Step 2: Run** `bun test src/features/deployment/deploy-params.test.ts` — FAIL.

- [ ] **Step 3: Implement** both functions. Empty or whitespace input → `default` (decimal → `decimalToBigInt`) or `0n`. Each field encodes with `{ ...ctx, enumName: slot.enum }`.

- [ ] **Step 4: Run** — PASS.

- [ ] **Step 5: Commit** — `feat(carbon): parameter selection and data stack building`

---

### Task 7: Reference search

**Files:**
- Create: `src/features/deployment/reference-search.ts`
- Modify: `src/features/inspector/chain/inspector-client.ts` (export `classify` as `classifyNodeError`)
- Test: `src/features/deployment/reference-search.test.ts`

**Interfaces:**
- Consumes: `classifyNodeError(e: unknown): InspectorError`.
- Produces:
  - `interface ReferenceLedger { contract: Pick<ContractApi, "getAllContractsByCodeHash">; transaction: Pick<TransactionApi, "getTransaction" | "getTransactionByFullHash"> }`
  - `interface CreationHeader { dataPages: number; callStackPages: number; userStackPages: number; minActivationPlanck: string }`
  - `parseCreationHeader(creationBytesHex: string): CreationHeader` — little-endian shorts at byte offsets 6, 8, 10 and the u64 at 12 (after version, reserved, code pages).
  - `interface ReferenceCandidate { contractId: string; name: string; creator: string; height: number; fullHash: string; header: CreationHeader }` — all from the original's deploy transaction (`transaction`, `attachment.name`, `sender`, `height`, `fullHash`, `attachment.creationBytes`).
  - `traceOriginal(ledger: ReferenceLedger, contractId: string): Promise<ReferenceCandidate | null>` — one step as in Decision 1; `null` when no valid original.
  - `findReferences(ledger: ReferenceLedger, codeHash: string, signal?: AbortSignal): Promise<ReferenceCandidate[]>` — rejects with `InspectorError`; resolves `[]` when aborted.
  - `pickReference(candidates: ReferenceCandidate[], accountId: string | null): ReferenceCandidate | null`

- [ ] **Step 1: Write the failing tests** with a fake ledger (`ats` of 3 contracts; `getTransaction` returns AT-creation transactions `{ transaction, fullHash, height, sender, type: 22, subtype: 0, attachment: { name, creationBytes } }`; contract 3 has `referencedTransactionFullHash: "aa"` (contract 1's), contract 4 is not among the hits and is referenced by a hit 5):

```ts
it("keeps originals and folds instances into their original", async () => {
  const found = await findReferences(fake, "123");
  expect(found.map((c) => c.contractId)).toEqual(["1", "2"]);
  expect(found[0]).toMatchObject({ fullHash: "aa", height: 10, creator: "100" });
});
it("finds an original that is not among the hits", async () =>
  expect((await findReferences(fakeWithOutsideOriginal, "123")).map((c) => c.contractId)).toContain("4"));
it("drops a reference that leads to no AT creation", async () =>
  expect(await traceOriginal(fakeBrokenRef, "3")).toBeNull());
it("parseCreationHeader reads pages and activation", () =>
  expect(parseCreationHeader("0300" + "0000" + "0100" + "0200" + "0100" + "0000" + "00e1f50500000000")).toEqual(
    { dataPages: 2, callStackPages: 1, userStackPages: 0, minActivationPlanck: "100000000" }));
it("asks for the first 25 hits", async () => {
  await findReferences(fake, "123");
  expect(fake.lastQuery).toMatchObject({ machineCodeHash: "123", firstIndex: 0, lastIndex: 24 });
});
it("pickReference prefers the account's own oldest, then the oldest", () => {
  const c = [cand("1", "100", 30), cand("2", "200", 10), cand("3", "100", 20)];
  expect(pickReference(c, "100")?.contractId).toBe("3");
  expect(pickReference(c, "999")?.contractId).toBe("2");
  expect(pickReference([], "100")).toBeNull();
});
it("aborted search resolves to nothing", async () => {
  const ac = new AbortController(); const p = findReferences(slowFake, "123", ac.signal); ac.abort();
  expect(await p).toEqual([]);
});
it("node errors become InspectorError", async () =>
  expect(findReferences(failingFake, "123")).rejects.toMatchObject({ kind: "unreachable" }));
```

- [ ] **Step 2: Run** `bun test src/features/deployment/reference-search.test.ts` — FAIL.

- [ ] **Step 3: Implement.** `getAllContractsByCodeHash({ machineCodeHash, includeDetails: false, firstIndex: 0, lastIndex: 24 })`, then `traceOriginal` per hit with at most 5 in flight; de-duplicate by `contractId`; check `signal.aborted` after each await and return `[]` once aborted.

- [ ] **Step 4: Run** — PASS. Also `bun test src/features/inspector/chain` — still PASS.

- [ ] **Step 5: Commit** — `feat(carbon): find deployed originals by code hash`

---

### Task 8: Deploy requests and the deployment flow

**Files:**
- Create: `src/features/deployment/deploy-request.ts`
- Modify: `src/features/asm-editor/deployment-view/deployment-flow.tsx` (props, `handleDeploy`)
- Modify: `src/features/asm-editor/deployment-view/large-contract-deployment.tsx` (props)
- Test: `src/features/deployment/deploy-request.test.ts`

**Interfaces:**
- Consumes: `MachineData`; `ReferenceCandidate` (Task 7).
- Produces:
  - `referenceDeployMinFeePlanck(header: CreationHeader): bigint` — Decision 7.
  - `type DeployRequest = { kind: "full"; machine: MachineData; name: string; description: string; activationPlanck: string; data: string[] } | { kind: "reference"; reference: Pick<ReferenceCandidate, "fullHash" | "contractId">; name: string; description: string; data: string[] }`
  - `buildUnsignedDeploy(ledger: { contract: Pick<ContractApi, "publishContract" | "publishContractByReference"> }, request: DeployRequest, common: { senderPublicKey: string; feePlanck: string; deadline: number }): Promise<string>` — the unsigned transaction bytes.
  - `DeploymentFlow` props become `{ request: DeployRequest; codeHash: string; deadline: number; fee: Amount; successAction?: (transactionId: string) => ReactNode }`.

- [ ] **Step 1: Write the failing tests** with a fake ledger recording calls:

```ts
it("full deploy sends code, pages, activation and data", async () => {
  await buildUnsignedDeploy(fake, { kind: "full", machine, name: "N", description: "D", activationPlanck: "5", data: ["1"] }, common);
  expect(fake.calls.publishContract[0]).toMatchObject({ codeHex: machine.ByteCode, dataPages: machine.DataPages, activationAmountPlanck: "5", data: ["1"], name: "N" });
});
it("reference deploy sends the full hash and data, never code", async () => {
  await buildUnsignedDeploy(fake, { kind: "reference", reference: { fullHash: "ab", contractId: "1" }, name: "N", description: "D", data: ["7"] }, common);
  const args = fake.calls.publishContractByReference[0];
  expect(args).toMatchObject({ referencedTransactionFullHash: "ab", data: ["7"], name: "N", feePlanck: common.feePlanck });
  expect(args).not.toHaveProperty("codeHex");
});
it("reference fee follows the original's pages", () => {
  expect(referenceDeployMinFeePlanck({ dataPages: 2, callStackPages: 1, userStackPages: 1, minActivationPlanck: "0" })).toBe(40_000_000n);
  expect(referenceDeployMinFeePlanck({ dataPages: 0, callStackPages: 0, userStackPages: 0, minActivationPlanck: "0" })).toBe(1_000_000n);
});
```

- [ ] **Step 2: Run** `bun test src/features/deployment/deploy-request.test.ts` — FAIL.

- [ ] **Step 3: Implement `buildUnsignedDeploy`** (the `publishContract` arguments move from `deployment-flow.tsx` unchanged, plus `skipAdditionalSecurityCheck: true` on both calls). Then **refactor `DeploymentFlow`**: size checks (`isTooLarge`, `isLargeContract`) apply only to `kind: "full"` using `request.machine`; `handleDeploy` calls `buildUnsignedDeploy(status.ledger, request, …)`; `announceDeployment` uses the `codeHash` prop. `LargeContractDeployment` takes `request` (kind `"full"`) instead of `data` + `initialData`. Update the one existing caller in `deployment-view.tsx` to pass `{ kind: "full", machine: data, name: data.PName, description: data.PDescription, activationPlanck: String(data.PActivationAmount), data: [] }` so behaviour is unchanged at this step.

- [ ] **Step 4: Run** `bun test src/features/deployment src/features/asm-editor` and the typecheck (Global Constraints) — PASS, no type errors.

- [ ] **Step 5: Commit** — `refactor(deploy): the deployment flow takes a full or reference deploy request`

---

### Task 9: Parameter form, preview and reference picker

**Files:**
- Create: `src/features/deployment/ui/parameter-form.tsx`, `ui/data-stack-preview.tsx`, `ui/reference-picker.tsx`
- Modify: `src/i18n/locales/en/asm-editor.json` (`params.*`, `reference.*`)

**Interfaces:**
- Consumes: `FieldState`, `PreviewRow` (Task 6); `Overwrite` (Task 5); `ReferenceCandidate` (Task 7).
- Produces:
  - `ParameterForm({ fields, enums, prefix, values, onChange, overwrites, confirmed, onConfirm, sourceKnown }: { fields: FieldState[]; enums: Record<string, Record<string, string>>; prefix: "S" | "TS"; values: Record<number, string>; onChange: (index: number, value: string) => void; overwrites: Overwrite[]; confirmed: Set<number>; onConfirm: (index: number, yes: boolean) => void; sourceKnown: boolean })`
  - `DataStackPreview({ rows, prefix }: { rows: PreviewRow[]; prefix: "S" | "TS" })`
  - `ReferencePicker({ candidates, selected, onSelect, prefix }: { candidates: ReferenceCandidate[]; selected: string | null; onSelect: (contractId: string) => void; prefix: "S" | "TS" })`
  - `parametersReady(fields: FieldState[], overwrites: Overwrite[], confirmed: Set<number>): boolean` exported from `parameter-form.tsx` — no field errors and every overwritten parameter confirmed.

- [ ] **Step 1: Write the failing test** `src/features/deployment/ui/parameter-form.test.ts` for `parametersReady` only (the components are verified in Task 10/11 in the running app):

```ts
it("needs every overwrite confirmed and no field errors", () => {
  const f = [{ slot: p(1), raw: 0n }, { slot: p(2), raw: 0n }];
  expect(parametersReady(f, [{ index: 2, line: 5 }], new Set())).toBe(false);
  expect(parametersReady(f, [{ index: 2, line: 5 }], new Set([2]))).toBe(true);
  expect(parametersReady([{ slot: p(1), raw: 0n, error: "invalid" }], [], new Set())).toBe(false);
});
```

- [ ] **Step 2: Run** `bun test src/features/deployment/ui` — FAIL.

- [ ] **Step 3: Implement** `parametersReady` and the three components with the existing `@/components/ui` inputs, select, checkbox and table styles. Copy (English, `asm-editor.json`):
  - `params.title` "Parameters", `params.hint` "Values written into the contract's data stack at deployment."
  - `params.none` "This contract has no deploy parameters. Mark slots as parameters in its Label Map (`param: true`)."
  - `params.overwritten` "Overwritten by line {line} on first activation", `params.confirmOverwrite` "I know this value will be overwritten"
  - `params.noSourceCheck` "Without source code, Studio cannot check whether top-level code overwrites these values."
  - `params.error.invalid|outOfRange|tooLong|tooManyDecimals|unknownEnum`, `params.tooLarge` "The data does not fit into the contract's {slots} data slots."
  - `params.preview` "Data stack", `params.internal` "internal"
  - `reference.title` "Deploy by reference", `reference.hint` "Reuses the code of a contract already on chain. Cheaper: only the data is sent.", `reference.original` "Original", `reference.inherited` "Activation amount and memory pages come from the original."
  - `reference.searching` "Looking for deployments of this code…", `reference.connect` "Connect XT Wallet to find existing deployments of this code.", `reference.failed` "Could not search the node: {message}", `reference.retry` "Search again", `reference.noneYet` "Once this code is on chain, you can deploy more instances cheaply by reference."

  Run `bun run i18n:types`.

- [ ] **Step 4: Run** the test and the typecheck (Global Constraints) — PASS.

- [ ] **Step 5: Commit** — `feat(carbon): parameter form, data stack preview and reference picker`

---

### Task 10: Deploy page with both paths

**Files:**
- Create: `src/features/deployment/use-reference-search.ts`
- Modify: `src/features/asm-editor/deployment-view/deployment-view.tsx`, `src/pages/deploy/deploy-page.tsx`, `src/i18n/locales/en/asm-editor.json`
- Delete: `src/features/asm-editor/deployment-view/data-initialization.tsx`

**Interfaces:**
- Consumes: everything from Tasks 4–9; `useWalletStatus`; `useLabelMaps`, `resolveLabelMap`; `generateLabels`.
- Produces:
  - `useReferenceSearch(codeHash: string | null, ledger: ReferenceLedger | null): { state: "idle" | "searching" | "done" | "failed"; candidates: ReferenceCandidate[]; error?: string; retry: () => void }` — a new `codeHash` aborts the running search and clears `candidates` immediately.
  - `DeploymentView` props: `{ data: MachineData; source: string; successAction?: (transactionId: string) => ReactNode }`.

- [ ] **Step 1: Implement `useReferenceSearch`** over `findReferences` with an `AbortController` per `codeHash`. Its guarantee (no stale result for a new hash) rests on Task 7's abort test; no separate hook test.

- [ ] **Step 2: Rework `DeploymentView`:**
  - Path toggle **Full deploy** / **Deploy by reference**; the reference path is enabled only with `candidates.length > 0`; otherwise show `reference.noneYet` (or `reference.connect` / `searching` / `failed` + retry by state).
  - Preselect with `pickReference(candidates, status?.accountId ?? null)`; `ReferencePicker` to change.
  - Parameters: `generated = generateLabels(source)` slots, `map` from `resolveLabelMap(data.MachineCodeHashId, undefined, labelMaps)` when its kind is `"hash"`, `paramSlots(generated, map)`; `buildDataStack` with `capacity: data.DataPages * 32`, `memory: data.Memory`, enums from the map; overwrites from `compileVerbose(source)` + `findOverwrittenParams`; `sourceKnown: true`.
  - Name and description inputs prefilled from `data.PName` / `data.PDescription`; activation amount input (SIGNA) on the full path only, read-only text with `reference.inherited` on the reference path.
  - Fee: the full path keeps `data.MinimumFeeNQT` as minimum; the reference path uses `referenceDeployMinFeePlanck(selected.header)`; capacity on the reference path is `selected.header.dataPages * 32`; show both minimums in the summary card.
  - Deploy is enabled only when `parametersReady(...)` and `data !== null`; build the `DeployRequest` for the chosen path and pass `codeHash={data.MachineCodeHashId}`.
- [ ] **Step 3: Update `DeployPage`** to pass the loaded `content` as `source`. Delete `data-initialization.tsx`. New copy: `deploy.pathFull` "Full deploy", `deploy.pathReference` "By reference", `deploy.activationEditable` "Activation amount (SIGNA)". `bun run i18n:types`.

- [ ] **Step 4: Verify** `bun test` (all) and the typecheck (Global Constraints) — PASS. Then `bun dev`, open a project whose contract follows the TESTBED convention, and check: parameters appear with suggested formats; an initialiser on a parameter shows the overwrite warning and blocks deploy until confirmed; without XT the `reference.connect` note shows; editing the source re-runs the search.

- [ ] **Step 5: Commit** — `feat(carbon): deploy page offers deploy by reference and deploy parameters`

---

### Task 11: New instance from the inspector

**Files:**
- Create: `src/features/inspector/instance/instance-reference.ts`, `src/features/inspector/ui/instance-deploy-dialog.tsx`
- Modify: `src/features/inspector/ui/contract-view.tsx`, `src/features/inspector/ui/inspector-editor.tsx`, `src/i18n/locales/en/inspector.json`
- Test: `src/features/inspector/instance/instance-reference.test.ts`

**Interfaces:**
- Consumes: `ReferenceLedger` (Task 7), `DeployRequest`/`DeploymentFlow` (Task 8), `ParameterForm`/`DataStackPreview` (Task 9), `paramSlots`/`buildDataStack` (Task 6), `labelTarget`, `upsertSlot`, `updateFileText`, `createLabelMapFor`, `addContracts`.
- Produces:
  - `resolveInstanceReference(ledger: ReferenceLedger & { contract: Pick<ContractApi, "getContract"> }, contractId: string, codeHash: string): Promise<{ ok: true; reference: ReferenceCandidate } | { ok: false; reason: "otherNetwork" | "noOriginal" | "node"; message?: string }>`
  - `ContractView` gains `onInstanceDeployed: (contractId: string) => void`.

- [ ] **Step 1: Write the failing tests**

```ts
it("uses the contract's own deploy transaction for an original", async () =>
  expect(await resolveInstanceReference(fake({ hash: "9", tx: { fullHash: "aa" } }), "1", "9")).toMatchObject({ ok: true, reference: { fullHash: "aa" } }));
it("traces an instance to its original", async () =>
  expect(await resolveInstanceReference(fake({ hash: "9", tx: { fullHash: "bb", referencedTransactionFullHash: "aa" } }), "1", "9")).toMatchObject({ ok: true, reference: { fullHash: "aa" } }));
it("rejects a missing or different contract on the wallet's node", async () => {
  expect(await resolveInstanceReference(fake({ notFound: true }), "1", "9")).toMatchObject({ ok: false, reason: "otherNetwork" });
  expect(await resolveInstanceReference(fake({ hash: "8", tx: { fullHash: "aa" } }), "1", "9")).toMatchObject({ ok: false, reason: "otherNetwork" });
});
```

- [ ] **Step 2: Run** `bun test src/features/inspector/instance` — FAIL.

- [ ] **Step 3: Implement `resolveInstanceReference`** — `getContract` on the wallet's ledger (`InspectorError` kind `"not-found"` → `otherNetwork`), compare `machineCodeHashId`, then `traceOriginal` (Task 7); `null` → `noOriginal`.

- [ ] **Step 4: Implement the dialog and wiring.**
  - `ContractView` shows **New instance** (with `contract` loaded); it opens `InstanceDeployDialog` with `contract`, `resolution`, `folderId`, `prefix`.
  - The dialog needs XT (`useWalletStatus`; otherwise `instance.connect`), calls `resolveInstanceReference` (on `otherNetwork`: `instance.otherNetwork` "XT Wallet is connected to a node that does not know this contract. Switch XT to the contract's network.").
  - Parameters: `paramSlots(null, resolvedMap)`, `buildDataStack` with `capacity: reference.header.dataPages * 32`, `sourceKnown: false`, no overwrites. Name/description prefilled from the contract; activation shown read-only from `reference.header.minActivationPlanck`.
  - **Mark as parameter:** a list of the slots up to capacity with a checkbox. Checking writes `upsertSlot(text, { ...existingLabel ?? { index, name: `slot${index}`, origin: "manual" }, param: true })` to the file from `labelTarget(resolution)`; target `"create"` first calls `createLabelMapFor`; target `"choose"` disables the list with `instance.ambiguous` "Several Label Maps claim this code hash — pin one first."
  - Deploy via `DeploymentFlow` with `{ kind: "reference", … }`, `codeHash={contract.machineCodeHashId}`, fee minimum `referenceDeployMinFeePlanck(reference.header)`; its `successAction` calls `onInstanceDeployed(transactionId)`.
  - `InspectorEditor` implements `onInstanceDeployed` as `write((text) => addContracts(text, [{ id, network: selected.network }]))` and selects the new entry.
  - New copy in `inspector.json`: `instance.button` "New instance", `instance.title` "New instance of {name}", `instance.connect`, `instance.otherNetwork`, `instance.ambiguous`, `instance.noOriginal` "The original deployment of this contract could not be found on this node.", `instance.markParams` "Deploy parameters", `instance.added` "Added to the watchlist". `bun run i18n:types`.

- [ ] **Step 5: Verify** `bun test` (all) and the typecheck (Global Constraints) — PASS.

- [ ] **Step 6: Commit** — `feat(carbon): create a new instance of a watched contract from the inspector`

---

### Task 12: Translations, full verification and acceptance

**Files:**
- Modify: `src/i18n/locales/{de,pt-BR,fr,es,it,uk,ru,zh-CN}/asm-editor.json` and `inspector.json`
- Modify: `docs/superpowers/notes/carbon-contracts-spike.md` (item 4)

- [ ] **Step 1: Translate** every new key into the eight locales, following `src/i18n/GLOSSARY.md`; keep `{placeholders}` and `` `code` `` spans as they are.

- [ ] **Step 2: Verify** from `apps/studio/`: `bun test` (all, including `src/i18n`), the typecheck (Global Constraints), `bun run i18n:report` (new keys 100 % in every locale), and from the repo root `bun run build` — all pass.

- [ ] **Step 3: Acceptance with the user on the sandbox** (spec §8): XT connected to `localhost:6876`; deploy a TESTBED-convention contract in full with parameters; deploy a second instance by reference from the deploy page with other parameters; deploy a third from the inspector's **New instance**; in the inspector, confirm each contract's parameter slots hold the entered values and the instances share the Label Map. Record in the spike notes that XT signed the reference transaction (spec §7 item 4).

- [ ] **Step 4: Commit** — `i18n(carbon): translations for all locales` (and the notes update).
