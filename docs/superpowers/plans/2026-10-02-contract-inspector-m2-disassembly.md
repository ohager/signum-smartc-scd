# Contract Inspector M2 (Disassembly) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Code tab to the Contract Inspector that shows a deployed contract's bytecode as labelled SmartC assembly. The tab adds:

- an outline of the code
- cross-references between slots and instructions
- a capability summary
- trust levels for every name shown
- an `.asm` export that is proven by re-assembling it to byte-identical code

**Architecture:** Pure modules under `features/inspector/disasm/` do the work:

- `opcode-index`: operand layouts derived from the existing asm-editor opcode syntax
- `decode`, `names`, `to-asm`, `verify`
- `outline`, `xrefs`, `capabilities`
- `trust`, `dor-map`

The UI adds one tab and connects it to the M1 tabs. Label Map changes are small, comment-preserving edits on top of M1's model.

**Tech Stack:** React 19, Tailwind 4, `smartc-signum-compiler@2.3.0` (also used as the assembler oracle), Zod 4, `jsonc-parser`, Bun test.

**Spec:** `docs/superpowers/specs/2026-10-02-contract-inspector-m2-disassembly-design.md` (M1 spec for context: `docs/superpowers/specs/2026-09-30-contract-inspector-design.md`)

## Global Constraints

- Paths are relative to `apps/studio/` unless they start with `docs/`. Run tests from `apps/studio/`: `bun test <path>`.
- Byte strings are lowercase hex. Addresses and slot indices are `number`; 64-bit constants are `bigint`.
- Decoding never throws.
- Every Label Map name or comment is rendered as **plain text**: no Markdown, no `dangerouslySetInnerHTML`. In `.asm` output it appears only as a sanitized asm name or as single-line `^comment` text.
- The inspector never deploys. Export writes a file; deploying stays in the existing deploy flow.
- No code from Signum D'Or (GPL-3.0). The Studio is Apache-2.0.
- UI strings go through `t()`; English keys in `src/i18n/locales/en/inspector.json`, then `bun run i18n:types`. Plurals use the Studio's object form `{ "one": …, "other": … }`.
- Row selection and hover use `ROW_SELECTED` / `ROW_HOVER` from `features/inspector/ui/selection.ts`, never `bg-accent`.
- Baseline before Task 1: `bun test` gives 810 pass, and `bunx tsc --noEmit -p tsconfig.json` reports 31 pre-existing errors. Neither number may get worse.
- Every commit message ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Deviations from the spec (decided while planning)

1. **The operand layout is derived, not stored** (§5.1). The spec wanted an `argsType` field added to every opcode form. About 50 forms are generated from templates such as `` `${mnemonic} @dest $var` ``, so a hand-kept field would duplicate what the syntax already says. `opcode-index.ts` parses `argsType` out of each form's `syntax`, and the test diffs the result against the assembler table. It is the same single source and the same guarantee, with nothing left to keep in sync by hand.
2. **Read/write classification** (§5.6). The spec listed only `INC`/`DEC`/`NOT` as read+write. Every arithmetic and bitwise `@dest` form also reads its destination (`ADD @a $b` is `a = a + b`). **Write-only** are `SET`, `CLR`, `POP` and `FUN @dest`; every other `@dest` is read+write.
3. **API form check.** An API code is accepted only together with its own opcode: `get_A1` is a `0x35` function and is never accepted as `0x33`. Otherwise the output would be text the assembler rejects.
4. **Slot index cap.** An `I` operand above `0xFFFF` makes the row `unknown` (reason `slot`). Real contracts use small indices, and declaring billions of slots would hang the assembler.
5. **Code labels in `.asm`** are emitted only at instruction starts. A target that lands anywhere else makes the listing non-assemblable, so such a label can never reach the export.

## Review Focus

1. **A contract whose code ends in operand bytes that are `00`**, for example a final `SET @x #0000000000000000` or `JMP` to address 0. Padding detection must not eat the tail of the last instruction. *Pinned in Task 2.*
2. **A Label Map name that sanitizes to an existing name or keyword shape** (`sale.price` and `sale_price` together, a name starting with a digit, an empty name). The `.asm` must still re-assemble. *Pinned in Task 4.*
3. **Real on-chain code, padded to whole pages.** Round-trip has to compare against the unpadded code. *Pinned in Task 5 by the testnet `stock` fixture (4,096 bytes, 71 bytes of padding).*
4. **An `^comment` text containing newlines or a `^declare`-looking line**, coming from a contract name or a labels path. It must not inject asm lines. *Pinned in Task 5.*
5. **Switching contracts while verification is running.** The result of the old contract must not show up on the new one. *Pinned in Task 9 (latest-only guard).*

---

## File Structure

```
apps/studio/src/features/inspector/disasm/
  opcode-index.ts      FormSpec per opcode (operand layout parsed from syntax), API index
  decode.ts            hex → Disassembly (rows: instruction | unknown | padding)
  names.ts             asm and display names for slots and code addresses
  to-asm.ts            renderInstruction, toAsm (with provenance header)
  verify.ts            re-assemble with SmartC, compare to the unpadded code
  outline.ts           entry points, sections, basic-block starts
  xrefs.ts             slot reads/writes, writes-through-pointer, incoming jumps, API sites
  capabilities.ts      capability summary from API sites
  trust.ts             verified / otherBuild / claim
  dor-map.ts           D'Or MAP export/import
  __fixtures__/stock.chain.hex   testnet contract 12589742833133361726 (= examples/stock.smart.c)
  test-support.ts      seeded PRNG + instruction encoder for fuzz tests (test-only helper)
apps/studio/src/features/inspector/workspace/
  export-asm.ts        write a unique .asm file next to the watchlist
apps/studio/src/features/inspector/ui/
  use-disassembly.ts   memoised analysis + lazy verification for one contract
  code-tab.tsx         header (capabilities, size, round-trip, export) + three columns
  code-outline.tsx     left column
  code-listing.tsx     centre column
  code-detail.tsx      right column
  code-label-dialog.tsx  "Name this location"
  trust-badge.tsx      icon + tooltip for a label's trust level
  dor-import-dialog.tsx  paste a D'Or MAP / compiler object
```

Modified files:

- `features/asm-editor/code-editor/language-definitions/opcodes/opcodes.test.ts`: argsType and API table diff
- `features/inspector/model/label-map.ts`: `source.codeHash`
- `features/inspector/model/label-map-edits.ts`: code label edits
- `features/inspector/model/merge-labels.ts`: records `source.codeHash`
- `features/inspector/compiler/label-generator.ts`: keeps `__` labels
- `features/inspector/ui/contract-view.tsx`: Code tab and cross-tab focus
- `features/inspector/ui/data-stack-tab.tsx`, `slot-detail.tsx`: xrefs and trust
- `features/inspector/ui/label-map-editor.tsx`: trust and D'Or
- `src/i18n/locales/*/inspector.json`

---

### Task 1: Opcode index (operand layout from syntax) and API table check

**Files:**
- Create: `src/features/inspector/disasm/opcode-index.ts`
- Test: `src/features/inspector/disasm/opcode-index.test.ts`
- Modify: `src/features/asm-editor/code-editor/language-definitions/opcodes/opcodes.test.ts`

**Interfaces:**
- Produces:
  - `type ArgType = "I" | "L" | "B" | "J" | "F"`
  - `type Access = "read" | "write" | "readwrite"`
  - `interface OperandSpec { type: ArgType; access?: Access; writesThrough?: boolean }` (`access` and `writesThrough` only for `I`)
  - `interface FormSpec { mnemonic: string; name: string; opCode: number; size: number; syntax: string; operands: OperandSpec[]; parts: (string | number)[] }`
    - `operands` are in **encoded** (byte) order.
    - `parts` are literal text chunks and encoded-operand indices, in syntax order.
  - `parseForm(mnemonic: string, form: { syntax: string; name: string; opCode: number; size: number }): FormSpec`
  - `FORMS: FormSpec[]`
  - `FORM_BY_OPCODE: Map<number, FormSpec>`
  - `interface ApiSpec { name: string; code: number; opCode: number }`
  - `API_BY_CODE: Map<number, ApiSpec>`
  - `APIS_BY_OPCODE: Map<number, ApiSpec[]>`
  - `BRANCH_MNEMONICS: ReadonlySet<string>`

- [ ] **Step 1: Write the failing test**

`src/features/inspector/disasm/opcode-index.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { API_BY_CODE, FORM_BY_OPCODE, FORMS, parseForm } from "./opcode-index";

const ASSEMBLER = require.resolve("smartc-signum-compiler/dist/assembler/assembler.js");
const source = await Bun.file(ASSEMBLER).text();

/** `{ opCode: 0x01, name: 'SET_VAL', size: 13, argsType: ['I', 'L'], …` */
const table = [
  ...source.matchAll(/\{\s*opCode:\s*(0x[0-9a-f]+),\s*name:\s*'(\w+)',\s*size:\s*(\d+),\s*argsType:\s*\[([^\]]*)\]/g),
].map((m) => ({ name: m[2]!, opCode: Number(m[1]), args: (m[4]!.match(/[ILBJF]/g) ?? []).join("") }));
const real = table.filter((e) => e.opCode < 0xf0);

describe("operand layout parsed from the documented syntax", () => {
  it("matches the assembler's argsType for every instruction", () => {
    const byName = new Map(FORMS.map((f) => [f.name, f]));
    const mismatches = real
      .map((e) => ({ name: e.name, expected: e.args, actual: byName.get(e.name)?.operands.map((o) => o.type).join("") }))
      .filter((m) => m.expected !== m.actual);
    expect(real.length).toBeGreaterThan(40);
    expect(mismatches).toEqual([]);
  });

  it("indexes every form by its opcode byte", () => {
    for (const e of real) expect(FORM_BY_OPCODE.get(e.opCode)?.name).toBe(e.name);
  });

  it("classifies access from the syntax", () => {
    const access = (opCode: number) => FORM_BY_OPCODE.get(opCode)!.operands.map((o) => `${o.type}:${o.access ?? ""}${o.writesThrough ? "*" : ""}`);
    expect(access(0x02)).toEqual(["I:write", "I:read"]); // SET @dest $var
    expect(access(0x06)).toEqual(["I:readwrite", "I:read"]); // ADD @dest $var
    expect(access(0x04)).toEqual(["I:readwrite"]); // INC @dest
    expect(access(0x03)).toEqual(["I:write"]); // CLR @dest
    expect(access(0x14)).toEqual(["I:read*", "I:read"]); // SET @($ptr) $var
    expect(access(0x15)).toEqual(["I:read*", "I:read*", "I:read"]); // SET @($ptr + $idx) $var
    expect(access(0x0f)).toEqual(["I:write", "I:read", "I:read"]); // SET @dest $($ptr + $idx)
    expect(access(0x36)).toEqual(["F:", "I:write", "I:read"]); // FUN @dest name $var1 — F encodes first
    expect(access(0x1b)).toEqual(["I:read", "B:"]); // BZR $var :label
  });

  it("keeps syntax order in parts while operands follow byte order", () => {
    const f = parseForm("FUN", { syntax: "FUN @dest name $var1", name: "EXT_FUN_RET_DAT", opCode: 0x36, size: 11 });
    expect(f.parts).toEqual(["FUN @", 1, " ", 0, " $", 2]);
  });
});

describe("API table", () => {
  const api = [...source.matchAll(/\{\s*name:\s*'(\w+)',\s*apiCode:\s*(0x[0-9a-f]+),\s*opCode:\s*(0x[0-9a-f]+)\s*\}/g)].map((m) => ({
    name: m[1]!, code: Number(m[2]), opCode: Number(m[3]),
  }));

  it("matches the assembler's API table exactly", () => {
    expect(api.length).toBeGreaterThan(80);
    const ours = [...API_BY_CODE.values()].map((a) => `${a.name}:${a.code}:${a.opCode}`).sort();
    expect(ours).toEqual(api.map((a) => `${a.name}:${a.code}:${a.opCode}`).sort());
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/inspector/disasm/opcode-index.test.ts`
Expected: FAIL, `Cannot find module './opcode-index'`.

- [ ] **Step 3: Implement**

`src/features/inspector/disasm/opcode-index.ts`:

```ts
import { AsmOpcodes } from "@/features/asm-editor/code-editor/language-definitions/opcodes";
import { AsmFunctions } from "@/features/asm-editor/code-editor/language-definitions/functions";

/**
 * What the disassembler knows about each opcode, taken from the asm editor's
 * documented syntax rather than a second table. The test diffs the result
 * against the installed assembler, so a compiler upgrade that changes an
 * instruction fails there instead of decoding quietly wrong.
 *
 * Reading the syntax:
 * - `@x` is the cell written; `$x` a cell read
 * - `@($p …)` writes through the pointers it names, which are themselves read
 * - `$($p …)` reads through pointers
 * - `#…` is a 64-bit constant; `:label` a jump target; `name` the API function
 *
 * Encoded order differs from syntax order only for `FUN`: the 2-byte function
 * code comes first even when the syntax puts `@dest` before it.
 */

export type ArgType = "I" | "L" | "B" | "J" | "F";
export type Access = "read" | "write" | "readwrite";

export interface OperandSpec {
  type: ArgType;
  access?: Access;
  writesThrough?: boolean;
}

export interface FormSpec {
  mnemonic: string;
  name: string;
  opCode: number;
  size: number;
  syntax: string;
  /** Encoded (byte) order. */
  operands: OperandSpec[];
  /** Syntax order: literal text, or the index of an encoded operand. */
  parts: (string | number)[];
}

export interface ApiSpec {
  name: string;
  code: number;
  opCode: number;
}

export const BRANCH_MNEMONICS: ReadonlySet<string> = new Set(["BZR", "BNZ", "BGT", "BLT", "BGE", "BLE", "BEQ", "BNE"]); // i18n-ignore
/** Only these overwrite their `@dest` without reading it; every other `@dest` is read too (`ADD @a $b` is `a = a + b`). */
const WRITE_ONLY: ReadonlySet<string> = new Set(["SET", "CLR", "POP", "FUN"]); // i18n-ignore

const ATOM = /([@$:])(\w+)|#([0-9a-f]{16})|\b(name)\b/g;

function parenRange(syntax: string, open: string): [number, number] | null {
  const start = syntax.indexOf(open);
  if (start < 0) return null;
  return [start, syntax.indexOf(")", start)];
}

export function parseForm(mnemonic: string, form: { syntax: string; name: string; opCode: number; size: number }): FormSpec {
  const { syntax } = form;
  // Atoms inside `@( … )` are the pointers written through; atoms inside
  // `$( … )` are plain reads, so they need no range of their own.
  const writeParens = parenRange(syntax, "@(");
  const inside = (range: [number, number] | null, at: number) => !!range && at > range[0] && at < range[1];

  const atoms: { spec: OperandSpec; before: string; start: number; end: number }[] = [];
  for (const m of syntax.matchAll(ATOM)) {
    const at = m.index!;
    let spec: OperandSpec;
    let sigil = "";
    if (m[4]) spec = { type: "F" };
    else if (m[3]) {
      spec = { type: "L" };
      sigil = "#";
    } else if (m[1] === ":") {
      spec = { type: BRANCH_MNEMONICS.has(mnemonic) ? "B" : "J" };
      sigil = ":";
    } else if (m[1] === "@") {
      spec = { type: "I", access: WRITE_ONLY.has(mnemonic) ? "write" : "readwrite" };
      sigil = "@";
    } else {
      spec = inside(writeParens, at) ? { type: "I", access: "read", writesThrough: true } : { type: "I", access: "read" };
      sigil = "$";
    }
    atoms.push({ spec, before: sigil, start: at, end: at + m[0].length });
  }

  const apiAt = atoms.findIndex((a) => a.spec.type === "F");
  const order = apiAt >= 0 ? [apiAt, ...atoms.map((_, i) => i).filter((i) => i !== apiAt)] : atoms.map((_, i) => i);
  const encodedIndexOf = new Map(order.map((syntaxIndex, encoded) => [syntaxIndex, encoded]));

  const parts: (string | number)[] = [];
  let cursor = 0;
  atoms.forEach((atom, i) => {
    const literal = syntax.slice(cursor, atom.start) + atom.before;
    if (literal) parts.push(literal);
    parts.push(encodedIndexOf.get(i)!);
    cursor = atom.end;
  });
  if (cursor < syntax.length) parts.push(syntax.slice(cursor));

  return { mnemonic, ...form, operands: order.map((i) => atoms[i]!.spec), parts };
}

export const FORMS: FormSpec[] = Object.entries(AsmOpcodes).flatMap(([mnemonic, op]) =>
  op.forms.map((f) => parseForm(mnemonic, f)),
);

export const FORM_BY_OPCODE = new Map(FORMS.map((f) => [f.opCode, f]));

export const API_BY_CODE = new Map(
  Object.entries(AsmFunctions).map(([name, f]) => [f.apiCode, { name, code: f.apiCode, opCode: f.opCode }]),
);

export const APIS_BY_OPCODE = new Map<number, ApiSpec[]>();
for (const api of API_BY_CODE.values()) {
  APIS_BY_OPCODE.set(api.opCode, [...(APIS_BY_OPCODE.get(api.opCode) ?? []), api]);
}
```

The literal for `@($ptr)` is `"SET @("` followed by the pointer, whose `before` is `"$"`. That renders as `SET @($ptr)`, which is correct.

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/features/inspector/disasm/opcode-index.test.ts`
Expected: PASS (5 tests).

If "matches the assembler's argsType" lists a mismatch:
- If it is a form whose syntax in the asm-editor docs disagrees with the assembler regex, the docs are wrong. Fix the `syntax` string there; the hover text is wrong too.
- If it is a rule in `parseForm`, fix the rule.

Ledger whichever it was.

- [ ] **Step 5: Extend the existing opcode test**

The asm-editor test should fail too if the syntax ever stops describing the bytes. In `opcodes.test.ts`, add after the last `it` inside the `describe`:

```ts
  it("describes each form's operands in the order and widths the assembler encodes them", async () => {
    const { FORMS } = await import("@/features/inspector/disasm/opcode-index");
    const args = new Map(
      [...source.matchAll(/name:\s*'(\w+)',\s*size:\s*\d+,\s*argsType:\s*\[([^\]]*)\]/g)].map((m) => [m[1]!, (m[2]!.match(/[ILBJF]/g) ?? []).join("")]),
    );
    const wrong = FORMS.filter((f) => args.has(f.name) && args.get(f.name) !== f.operands.map((o) => o.type).join(""));
    expect(wrong.map((f) => f.name)).toEqual([]);
  });
```

Run: `bun test src/features/asm-editor src/features/inspector/disasm`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/inspector/disasm apps/studio/src/features/asm-editor/code-editor/language-definitions/opcodes/opcodes.test.ts
git commit -m "feat(inspector): opcode index with operand layouts parsed from the documented syntax

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Decoder

**Files:**
- Create: `src/features/inspector/disasm/decode.ts`
- Create: `src/features/inspector/disasm/__fixtures__/stock.chain.hex`
- Test: `src/features/inspector/disasm/decode.test.ts`

**Interfaces:**
- Consumes: `FORM_BY_OPCODE`, `API_BY_CODE`, `FormSpec`, `Access` (Task 1)
- Produces:
  - `type Operand = { kind: "slot"; index: number; access: Access; writesThrough: boolean } | { kind: "const"; value: bigint } | { kind: "target"; address: number; relative: boolean } | { kind: "api"; code: number; name: string }`
  - `type InstructionRow = { kind: "instruction"; address: number; size: number; bytes: string; form: FormSpec; operands: Operand[] }`
  - `type Row = InstructionRow | { kind: "unknown"; address: number; size: 1; bytes: string; reason: "opcode" | "api" | "slot" | "truncated" } | { kind: "padding"; address: number; size: number }`
  - `interface Disassembly { rows: Row[]; instructions: InstructionRow[]; codeLength: number; misaligned: number[]; assemblable: boolean }`
    - `codeLength` is the number of bytes before the padding.
    - `misaligned` holds the addresses of instructions whose target does not land on an instruction start.
  - `MAX_SLOT = 0xffff`
  - `decode(hex: string): Disassembly`

- [ ] **Step 1: Add the on-chain fixture**

Fetch testnet contract `12589742833133361726` (compiled from `examples/stock.smart.c`, code hash `9876981135868307127`) and store its `machineCode`:

```bash
curl -s "https://europe3.testnet.signum.network/api?requestType=getAT&at=12589742833133361726" \
  | bun -e 'const d = await Bun.stdin.json(); await Bun.write("src/features/inspector/disasm/__fixtures__/stock.chain.hex", d.machineCode)'
wc -c src/features/inspector/disasm/__fixtures__/stock.chain.hex
```

Expected: `8192` (4,096 bytes as hex).

The data is public chain data. Committing it makes the tests independent of the network.

- [ ] **Step 2: Write the failing test**

`src/features/inspector/disasm/decode.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SmartC } from "smartc-signum-compiler";
import { decode, MAX_SLOT } from "./decode";

const chain = readFileSync(join(import.meta.dir, "__fixtures__/stock.chain.hex"), "utf8").trim();
const stockSource = readFileSync(join(import.meta.dir, "../../../../../../examples/stock.smart.c"), "utf8");

describe("decode", () => {
  it("decodes typed operands", () => {
    // SET @3 $0 · BZR $3 :+6 · JMP :0 · FUN @2 get_A1 · FIN
    const hex = "02" + "03000000" + "00000000" + "1b" + "03000000" + "06" + "1a" + "00000000" + "35" + "0001" + "02000000" + "28";
    const d = decode(hex);
    expect(d.instructions.map((i) => i.form.name)).toEqual(["SET_DAT", "BZR_DAT", "JMP_ADR", "EXT_FUN_RET", "FIN_IMD"]);
    expect(d.instructions[0]!.operands).toEqual([
      { kind: "slot", index: 3, access: "write", writesThrough: false },
      { kind: "slot", index: 0, access: "read", writesThrough: false },
    ]);
    expect(d.instructions[1]!.operands[1]).toEqual({ kind: "target", address: 15, relative: true });
    expect(d.instructions[3]!.operands[0]).toEqual({ kind: "api", code: 0x0100, name: "get_A1" });
    expect(d.assemblable).toBe(true);
  });

  it("resolves negative branch offsets", () => {
    const hex = "04" + "00000000" + "1e" + "00000000" + "fb"; // INC @0 · BNZ $0 :-5
    expect(decode(hex).instructions[1]!.operands[1]).toEqual({ kind: "target", address: 0, relative: true });
  });

  it("treats trailing zero bytes as padding only at an instruction boundary", () => {
    // SET @0 #0000000000000000 ends in eight 00 bytes that belong to the instruction
    const hex = "01" + "00000000" + "0000000000000000" + "0000000000";
    const d = decode(hex);
    expect(d.instructions).toHaveLength(1);
    expect(d.instructions[0]!.size).toBe(13);
    expect(d.codeLength).toBe(13);
    expect(d.rows.at(-1)).toEqual({ kind: "padding", address: 13, size: 5 });
  });

  it("turns bad bytes into unknown rows and keeps going", () => {
    const reasons = (hex: string) =>
      decode(hex).rows.flatMap((r) => (r.kind === "unknown" ? [r.reason] : []));
    // Each case on its own: in one stream, a later byte could become part of an earlier instruction.
    expect(reasons("ff")).toEqual(["opcode"]);
    expect(reasons("33" + "0001" + "05000000")[0]).toBe("api"); // get_A1 is a 0x35 function, not 0x33
    expect(reasons("04" + "ffffff7f")[0]).toBe("slot");
    expect(reasons("02" + "0000")[0]).toBe("truncated");
    const resumed = decode("ff" + "28");
    expect(resumed.instructions.map((i) => i.form.mnemonic)).toEqual(["FIN"]);
    expect(resumed.assemblable).toBe(false);
    expect(MAX_SLOT).toBe(0xffff);
  });

  it("flags targets that do not land on an instruction", () => {
    const d = decode("1a" + "02000000" + "28"); // JMP :2 (inside the JMP itself)
    expect(d.misaligned).toEqual([0]);
    expect(d.assemblable).toBe(false);
  });

  it("never throws on odd input", () => {
    for (const hex of ["", "0", "zz", "02", "00", "  1A00000000  "]) expect(() => decode(hex)).not.toThrow();
  });

  it("decodes the real testnet contract up to its page padding", () => {
    const compiled = new SmartC({ language: "C", sourceCode: stockSource });
    compiled.compile();
    const code = compiled.getMachineCode().ByteCode.toLowerCase();
    const d = decode(chain);
    expect(chain.length / 2).toBe(4096);
    expect(d.codeLength).toBe(code.length / 2);
    expect(d.rows.at(-1)).toMatchObject({ kind: "padding", size: 4096 - code.length / 2 });
    expect(d.assemblable).toBe(true);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun test src/features/inspector/disasm/decode.test.ts`
Expected: FAIL, `Cannot find module './decode'`.

- [ ] **Step 4: Implement**

`src/features/inspector/disasm/decode.ts`:

```ts
import { API_BY_CODE, FORM_BY_OPCODE, type Access, type FormSpec } from "./opcode-index";

/**
 * AT bytecode → rows, one linear sweep from address 0. Nothing here throws:
 * a byte that is not an instruction becomes an `unknown` row and decoding
 * resumes at the next byte, because a half-readable listing is worth more
 * to someone investigating a contract than an error.
 *
 * Code is stored padded to whole pages with `00`. `00` is not an opcode, so
 * padding starts at the first instruction boundary after which only zeros
 * follow; zeros inside the last instruction's operands stay its operands.
 */

export type Operand =
  | { kind: "slot"; index: number; access: Access; writesThrough: boolean }
  | { kind: "const"; value: bigint }
  | { kind: "target"; address: number; relative: boolean }
  | { kind: "api"; code: number; name: string };

export type InstructionRow = {
  kind: "instruction";
  address: number;
  size: number;
  bytes: string;
  form: FormSpec;
  operands: Operand[];
};

export type Row =
  | InstructionRow
  | { kind: "unknown"; address: number; size: 1; bytes: string; reason: "opcode" | "api" | "slot" | "truncated" }
  | { kind: "padding"; address: number; size: number };

export interface Disassembly {
  rows: Row[];
  instructions: InstructionRow[];
  /** Bytes before the page padding. */
  codeLength: number;
  /** Addresses of instructions whose target is not an instruction start. */
  misaligned: number[];
  assemblable: boolean;
}

/** Slot indices above this are treated as garbage, not as a request to declare billions of cells. */
export const MAX_SLOT = 0xffff;

function byteAt(hex: string, at: number): number {
  return parseInt(hex.slice(at * 2, at * 2 + 2), 16);
}

function readU(hex: string, at: number, width: number): number {
  let value = 0;
  for (let i = width - 1; i >= 0; i--) value = value * 256 + byteAt(hex, at + i);
  return value;
}

function readU64(hex: string, at: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(byteAt(hex, at + i));
  return value;
}

export function decode(input: string): Disassembly {
  const raw = input.trim().toLowerCase();
  const hex = /^[0-9a-f]*$/.test(raw) && raw.length % 2 === 0 ? raw : "";
  const total = hex.length / 2;
  const rows: Row[] = [];
  const unknown = (at: number, reason: "opcode" | "api" | "slot" | "truncated") =>
    rows.push({ kind: "unknown", address: at, size: 1, bytes: hex.slice(at * 2, at * 2 + 2), reason });

  let at = 0;
  while (at < total) {
    if (/^0*$/.test(hex.slice(at * 2))) {
      rows.push({ kind: "padding", address: at, size: total - at });
      break;
    }
    const form = FORM_BY_OPCODE.get(byteAt(hex, at));
    if (!form) {
      unknown(at, "opcode");
      at++;
      continue;
    }
    if (at + form.size > total) {
      unknown(at, "truncated");
      at++;
      continue;
    }

    let p = at + 1;
    let bad: "api" | "slot" | null = null;
    const operands: Operand[] = form.operands.map((spec) => {
      switch (spec.type) {
        case "I": {
          const index = readU(hex, p, 4);
          p += 4;
          if (index > MAX_SLOT) bad = "slot";
          return { kind: "slot", index, access: spec.access!, writesThrough: !!spec.writesThrough };
        }
        case "L": {
          const value = readU64(hex, p);
          p += 8;
          return { kind: "const", value };
        }
        case "J": {
          const address = readU(hex, p, 4);
          p += 4;
          return { kind: "target", address, relative: false };
        }
        case "B": {
          const offset = byteAt(hex, p);
          p += 1;
          return { kind: "target", address: at + (offset > 127 ? offset - 256 : offset), relative: true };
        }
        case "F": {
          const code = readU(hex, p, 2);
          p += 2;
          const api = API_BY_CODE.get(code);
          // An API function only exists in its own form: get_A1 as 0x33 is not assemblable.
          if (!api || api.opCode !== form.opCode) bad = "api";
          return { kind: "api", code, name: api?.name ?? "" };
        }
      }
    });
    if (bad) {
      unknown(at, bad);
      at++;
      continue;
    }
    rows.push({ kind: "instruction", address: at, size: form.size, bytes: hex.slice(at * 2, (at + form.size) * 2), form, operands });
    at += form.size;
  }

  const instructions = rows.filter((r): r is InstructionRow => r.kind === "instruction");
  const starts = new Set(instructions.map((i) => i.address));
  const misaligned = instructions
    .filter((i) => i.operands.some((o) => o.kind === "target" && !starts.has(o.address)))
    .map((i) => i.address);
  const padding = rows.find((r) => r.kind === "padding");

  return {
    rows,
    instructions,
    codeLength: padding ? padding.address : total,
    misaligned,
    assemblable: !rows.some((r) => r.kind === "unknown") && misaligned.length === 0,
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun test src/features/inspector/disasm/decode.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/inspector/disasm
git commit -m "feat(inspector): AT bytecode decoder with page padding and unknown-byte recovery

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Label Map changes (source code hash, code label edits, compiler labels kept)

**Files:**
- Modify: `src/features/inspector/model/label-map.ts`
- Modify: `src/features/inspector/model/label-map-edits.ts`
- Modify: `src/features/inspector/model/merge-labels.ts`
- Modify: `src/features/inspector/compiler/label-generator.ts`
- Test: extend `label-map.test.ts`, `label-map-edits.test.ts`, `merge-labels.test.ts`, `compiler/label-generator.test.ts`

**Interfaces:**
- Produces:
  - `LabelMap["source"]` becomes `{ file: string; generatedAt: string; codeHash?: string } | undefined`
  - `upsertCodeLabel(text: string, label: CodeLabel): string`: matches by `address`; `origin` defaults to `"manual"`; inserted in address order
  - `removeCodeLabel(text: string, address: number): string`
  - `mergeGenerated(...)` sets `map.source.codeHash = generated.codeHash`
  - `generateLabels(...)` returns **all** compiler labels, including `__fn_*` and other `__` labels, with `origin: "compiler"`

- [ ] **Step 1: Write the failing tests**

Append to `src/features/inspector/model/label-map.test.ts`:

```ts
describe("source.codeHash", () => {
  it("accepts the hash the labels were generated for", () => {
    const r = parseLabelMap(`{ "version": 1, "name": "x", "codeHashes": [],
      "source": { "file": "a.smart.c", "generatedAt": "2026-10-02T00:00:00Z", "codeHash": "77" } }`);
    expect(r.ok && r.value.source?.codeHash).toBe("77");
  });
});
```

Append to `src/features/inspector/model/label-map-edits.test.ts`, and add `upsertCodeLabel`, `removeCodeLabel` to its import from `./label-map-edits`:

```ts
describe("code labels", () => {
  it("inserts by address, replaces an address, removes, and keeps comments", () => {
    let out = upsertCodeLabel(base, { address: 40, name: "sell" });
    out = upsertCodeLabel(out, { address: 8, name: "main" });
    out = upsertCodeLabel(out, { address: 40, name: "sellNft" });
    expect(parsed(out).codeLabels).toEqual([
      { address: 8, name: "main", origin: "manual" },
      { address: 40, name: "sellNft", origin: "manual" },
    ]);
    expect(parsed(removeCodeLabel(out, 8)).codeLabels.map((c) => c.address)).toEqual([40]);
    expect(out).toContain("// top comment");
  });
});
```

Append to `src/features/inspector/model/merge-labels.test.ts`:

```ts
describe("mergeGenerated records the build", () => {
  it("stores the generated code hash in source", () => {
    const { map } = mergeGenerated(existing, generated, { sourceFile: "c.smart.c", now: new Date(0) });
    expect(map.source?.codeHash).toBe("2");
  });
});
```

In `src/features/inspector/compiler/label-generator.test.ts`, replace the test `"emits code labels without compiler-internal ones"` with:

```ts
  it("keeps the compiler's function labels", () => {
    const r = generateLabels(typed);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.labels.codeLabels).toContainEqual({ address: expect.any(Number), name: "__fn_helper", origin: "compiler" });
  });
```

The old test pinned M1's bug: it asserted that no `__` label survives, which is exactly why M1 reported 0 code labels. Spec §5.7 reverses it.

- [ ] **Step 2: Run to verify they fail**

Run: `bun test src/features/inspector/model src/features/inspector/compiler`
Expected: 4 failures:
- `codeHash` is rejected by the strict schema
- `upsertCodeLabel` is not exported
- `source.codeHash` is undefined
- `__fn_helper` is missing

- [ ] **Step 3: Implement**

In `label-map.ts`, change the `source` line to:

```ts
    source: z
      .strictObject({
        file: z.string(),
        generatedAt: z.string(),
        codeHash: Unsigned.optional().describe("Code hash of the build these labels were generated from"),
      })
      .optional(),
```

In `label-map-edits.ts`, append:

```ts
export function upsertCodeLabel(text: string, label: CodeLabel): string {
  const entry = { ...label, origin: label.origin ?? "manual" };
  const labels = current(text).codeLabels;
  const at = labels.findIndex((c) => c.address === label.address);
  if (at >= 0) return editDocument(text, ["codeLabels", at], entry);
  const before = labels.findIndex((c) => c.address > label.address);
  return insertAt(text, "codeLabels", before < 0 ? labels.length : before, entry);
}

export function removeCodeLabel(text: string, address: number): string {
  const at = current(text).codeLabels.findIndex((c) => c.address === address);
  return at < 0 ? text : editDocument(text, ["codeLabels", at], undefined);
}
```

In `merge-labels.ts`, inside `mergeGenerated`, change the `source` line to:

```ts
      source: { file: meta.sourceFile, generatedAt: meta.now.toISOString(), codeHash: generated.codeHash },
```

In `label-generator.ts`, replace the `codeLabels` construction with:

```ts
    // Every compiler label is kept. `__fn_name` marks a function — the most
    // useful name there is in a disassembly — and M1 dropped it with the rest
    // of the `__` labels; the display layer shortens it, the data keeps it.
    const codeLabels: CodeLabel[] = (mc.Labels ?? []).map((l) => ({
      address: l.address,
      name: l.label,
      origin: "compiler",
    }));
```

- [ ] **Step 4: Run to verify they pass**

Run: `bun test src/features/inspector`
Expected: PASS, including all M1 tests.

`inspect-deployed.test.ts` must still pass: it does not assert code labels.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector
git commit -m "feat(inspector): code-label edits, the generating build's hash, and compiler function labels

M1's generator dropped every __-prefixed label, so __fn_* function names
never reached a Label Map.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Names

**Files:**
- Create: `src/features/inspector/disasm/names.ts`
- Test: `src/features/inspector/disasm/names.test.ts`

**Interfaces:**
- Consumes: `Disassembly` (Task 2), `LabelMap`, `SlotLabel`, `CodeLabel` (M1)
- Produces:
  - `sanitize(name: string): string`
  - `displayCodeName(asm: string): string` (`__fn_x` → `x`)
  - `interface Names { slotCount: number; slotAsm: string[]; slotDisplay: (string | null)[]; slotLabel: (SlotLabel | null)[]; targetAsm: Map<number, string>; targetDisplay: Map<number, string>; codeLabel: Map<number, CodeLabel> }`
  - `buildNames(dis: Disassembly | null, map: LabelMap | null, dataSlots: number): Names`

- [ ] **Step 1: Write the failing test**

`src/features/inspector/disasm/names.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import type { LabelMap } from "../model/label-map";
import { decode } from "./decode";
import { buildNames, displayCodeName, sanitize } from "./names";

const map = (over: Partial<LabelMap>): LabelMap => ({
  version: 1, name: "m", codeHashes: [], slots: [], maps: [], enums: {}, codeLabels: [], ...over,
});

describe("sanitize", () => {
  it("makes any name a valid asm identifier", () => {
    expect(sanitize("sale.price")).toBe("sale_price");
    expect(sanitize("2nd")).toBe("_2nd");
    expect(sanitize("")).toBe("_");
    expect(sanitize("ünïcode name")).toBe("__n_code_name");
  });
});

describe("displayCodeName", () => {
  it("shortens compiler function labels only", () => {
    expect(displayCodeName("__fn_helper")).toBe("helper");
    expect(displayCodeName("__if12_endif")).toBe("__if12_endif");
    expect(displayCodeName("sellNft")).toBe("sellNft");
  });
});

describe("buildNames", () => {
  // SET @3 $0 · JMP :0
  const dis = decode("02" + "03000000" + "00000000" + "1a" + "00000000");

  it("names every slot up to the highest used or present, without gaps", () => {
    const names = buildNames(dis, null, 2);
    expect(names.slotCount).toBe(4);
    expect(names.slotAsm).toEqual(["var_000", "var_001", "var_002", "var_003"]);
    expect(names.slotDisplay).toEqual([null, null, null, null]);
  });

  it("uses labels, array items and collision-free asm names", () => {
    const names = buildNames(
      dis,
      map({
        slots: [
          { index: 0, name: "sale.price" },
          { index: 1, name: "sale_price" },
          { index: 2, name: "prices", length: 2 },
        ],
      }),
      0,
    );
    expect(names.slotAsm).toEqual(["sale_price", "sale_price_2", "prices_0", "prices_1"]);
    expect(names.slotDisplay).toEqual(["sale.price", "sale_price", "prices[0]", "prices[1]"]);
  });

  it("names targets from code labels, compiler functions or their address", () => {
    const named = buildNames(dis, map({ codeLabels: [{ address: 0, name: "__fn_main", origin: "compiler" }] }), 0);
    expect(named.targetAsm.get(0)).toBe("__fn_main");
    expect(named.targetDisplay.get(0)).toBe("main");
    expect(buildNames(dis, null, 0).targetAsm.get(0)).toBe("lab_0000");
  });

  it("keeps slot and label names apart", () => {
    const names = buildNames(
      dis,
      map({ slots: [{ index: 0, name: "loop" }], codeLabels: [{ address: 0, name: "loop" }] }),
      0,
    );
    expect(names.slotAsm[0]).toBe("loop");
    expect(names.targetAsm.get(0)).toBe("loop_2");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/inspector/disasm/names.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/features/inspector/disasm/names.ts`:

```ts
import type { CodeLabel, LabelMap, SlotLabel } from "../model/label-map";
import type { Disassembly } from "./decode";

/**
 * Two names for everything: what the user reads (the Label Map's own text,
 * `prices[1]`, `helper`) and what the assembler accepts (`\w+`, unique).
 * Display names never reach the `.asm`; asm names never replace what the
 * user wrote.
 */

export interface Names {
  slotCount: number;
  slotAsm: string[];
  slotDisplay: (string | null)[];
  slotLabel: (SlotLabel | null)[];
  targetAsm: Map<number, string>;
  targetDisplay: Map<number, string>;
  codeLabel: Map<number, CodeLabel>;
}

export function sanitize(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  if (!cleaned) return "_";
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

export function displayCodeName(asm: string): string {
  return asm.startsWith("__fn_") ? asm.slice(5) : asm;
}

function unique(base: string, used: Set<string>): string {
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
  used.add(name);
  return name;
}

export function buildNames(dis: Disassembly | null, map: LabelMap | null, dataSlots: number): Names {
  const labels = map?.slots ?? [];
  let highest = dataSlots - 1;
  for (const i of dis?.instructions ?? []) {
    for (const o of i.operands) if (o.kind === "slot") highest = Math.max(highest, o.index);
  }
  for (const l of labels) highest = Math.max(highest, l.index + (l.length ?? 1) - 1);
  const slotCount = highest + 1;
  const width = Math.max(3, String(Math.max(0, slotCount - 1)).length);

  const used = new Set<string>();
  const slotAsm: string[] = [];
  const slotDisplay: (string | null)[] = [];
  const slotLabel: (SlotLabel | null)[] = [];
  for (let index = 0; index < slotCount; index++) {
    const label = labels.find((l) => index >= l.index && index < l.index + (l.length ?? 1)) ?? null;
    const isArray = !!label && (label.length ?? 1) > 1;
    const offset = label ? index - label.index : 0;
    slotLabel.push(label);
    slotDisplay.push(label ? (isArray ? `${label.name}[${offset}]` : label.name) : null);
    const base = label ? sanitize(isArray ? `${label.name}_${offset}` : label.name) : `var_${String(index).padStart(width, "0")}`;
    slotAsm.push(unique(base, used));
  }

  const codeLabel = new Map((map?.codeLabels ?? []).map((c) => [c.address, c]));
  const targets = new Set<number>(codeLabel.keys());
  for (const i of dis?.instructions ?? []) {
    for (const o of i.operands) if (o.kind === "target") targets.add(o.address);
  }
  const targetAsm = new Map<number, string>();
  const targetDisplay = new Map<number, string>();
  for (const address of [...targets].sort((a, b) => a - b)) {
    const label = codeLabel.get(address);
    const asm = unique(label ? sanitize(label.name) : `lab_${address.toString(16).padStart(4, "0")}`, used);
    targetAsm.set(address, asm);
    targetDisplay.set(address, label ? displayCodeName(label.name) : asm);
  }

  return { slotCount, slotAsm, slotDisplay, slotLabel, targetAsm, targetDisplay, codeLabel };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/features/inspector/disasm/names.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/disasm
git commit -m "feat(inspector): display and asm names for slots and code addresses

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Assembly output and round-trip verification

**Files:**
- Create: `src/features/inspector/disasm/to-asm.ts`
- Create: `src/features/inspector/disasm/verify.ts`
- Create: `src/features/inspector/disasm/test-support.ts`
- Test: `src/features/inspector/disasm/round-trip.test.ts`

**Interfaces:**
- Consumes: `decode`, `Disassembly`, `InstructionRow`, `Operand` (Task 2); `Names`, `buildNames` (Task 4); `FORMS`, `APIS_BY_OPCODE` (Task 1); `generateLabels` (M1, fixed in Task 3)
- Produces:
  - `operandText(o: Operand, names: { slot(index: number): string; target(address: number): string }): string`
  - `renderInstruction(row: InstructionRow, names: { slot(index: number): string; target(address: number): string }): string`
  - `interface Provenance { contractId: string; contractRS: string; network: string; codeHash: string; creatorRS: string; date: Date; labelsFile: string | null }`
  - `toAsm(dis: Disassembly, names: Names, provenance: Provenance): string` (throws if `!dis.assemblable`)
  - `type VerifyResult = { ok: true } | { ok: false; reason: "compile"; message: string } | { ok: false; reason: "differs"; byte: number }`
  - `verifyRoundTrip(asm: string, dis: Disassembly, originalHex: string): VerifyResult`
  - test-only: `mulberry32(seed: number): () => number`, `randomProgram(rand: () => number, count: number): string`

- [ ] **Step 1: Write the test support (encoder and PRNG)**

`src/features/inspector/disasm/test-support.ts`:

```ts
import { APIS_BY_OPCODE, FORMS, type FormSpec } from "./opcode-index";

/** Seeded PRNG so a failing fuzz case reproduces. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const le = (value: number, width: number) => {
  let out = "";
  for (let i = 0; i < width; i++) out += ((value >>> (8 * i)) & 0xff).toString(16).padStart(2, "0");
  return out;
};

/**
 * A random but valid program: every form the decoder knows, small slots,
 * real API functions for their own form, and jump/branch targets that land
 * on instruction starts (branches within their signed-byte reach).
 */
export function randomProgram(rand: () => number, count: number): string {
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const usable = FORMS.filter((f) => !f.operands.some((o) => o.type === "F") || APIS_BY_OPCODE.has(f.opCode));
  const forms: FormSpec[] = Array.from({ length: count }, () => pick(usable));
  const starts: number[] = [];
  let at = 0;
  for (const f of forms) {
    starts.push(at);
    at += f.size;
  }
  return forms
    .map((f, k) => {
      const self = starts[k]!;
      let bytes = f.opCode.toString(16).padStart(2, "0");
      for (const o of f.operands) {
        if (o.type === "I") bytes += le(Math.floor(rand() * 12), 4);
        if (o.type === "L") bytes += le(Math.floor(rand() * 2 ** 32), 4) + le(Math.floor(rand() * 2 ** 32), 4);
        if (o.type === "J") bytes += le(pick(starts), 4);
        if (o.type === "B") {
          const reach = starts.filter((s) => s - self >= -128 && s - self <= 127);
          bytes += le((pick(reach) - self) & 0xff, 1);
        }
        if (o.type === "F") bytes += le(pick(APIS_BY_OPCODE.get(f.opCode)!).code, 2);
      }
      return bytes;
    })
    .join("");
}
```

- [ ] **Step 2: Write the failing round-trip test**

`src/features/inspector/disasm/round-trip.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SmartC } from "smartc-signum-compiler";
import { generateLabels } from "../compiler/label-generator";
import type { LabelMap } from "../model/label-map";
import { decode } from "./decode";
import { buildNames } from "./names";
import { mulberry32, randomProgram } from "./test-support";
import { toAsm, type Provenance } from "./to-asm";
import { verifyRoundTrip } from "./verify";

const ROOT = join(import.meta.dir, "../../../../../..");
const sources = [
  ...readdirSync(join(ROOT, "examples")).filter((f) => f.endsWith(".smart.c")).map((f) => join(ROOT, "examples", f)),
  join(ROOT, "apps/studio/src/features/testbed/__fixtures__/counter.smart.c"),
  join(ROOT, "apps/studio/src/features/inspector/compiler/__fixtures__/typed.smart.c"),
];

const provenance: Provenance = {
  contractId: "1", contractRS: "S-TEST", network: "testnet", codeHash: "0", creatorRS: "S-CREATOR",
  date: new Date("2026-10-02T00:00:00Z"), labelsFile: null,
};

function compile(source: string) {
  const c = new SmartC({ language: "C", sourceCode: source });
  c.compile();
  return c.getMachineCode().ByteCode.toLowerCase();
}

function labelMapFrom(source: string): LabelMap {
  const r = generateLabels(source);
  if (!r.ok) throw new Error(r.error.message);
  return { version: 1, name: "g", codeHashes: [], slots: r.labels.slots, maps: [], enums: {}, codeLabels: r.labels.codeLabels };
}

function roundTrip(hex: string, map: LabelMap | null) {
  const dis = decode(hex);
  expect(dis.assemblable).toBe(true);
  const asm = toAsm(dis, buildNames(dis, map, 0), provenance);
  return verifyRoundTrip(asm, dis, hex);
}

describe("round trip: disassemble → assemble with SmartC → identical bytes", () => {
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    it(`${file.split("/").pop()} without labels`, () => expect(roundTrip(compile(source), null)).toEqual({ ok: true }));
    it(`${file.split("/").pop()} with labels generated from its source`, () =>
      expect(roundTrip(compile(source), labelMapFrom(source))).toEqual({ ok: true }));
  }

  it("the real testnet contract, compared without its page padding", () => {
    const chain = readFileSync(join(import.meta.dir, "__fixtures__/stock.chain.hex"), "utf8").trim();
    const map = labelMapFrom(readFileSync(join(ROOT, "examples/stock.smart.c"), "utf8"));
    expect(roundTrip(chain, map)).toEqual({ ok: true });
  });

  it("300 random valid programs", () => {
    const rand = mulberry32(20261002);
    for (let n = 0; n < 300; n++) {
      const hex = randomProgram(rand, 1 + Math.floor(rand() * 40));
      expect({ n, result: roundTrip(hex, null) }).toEqual({ n, result: { ok: true } });
    }
  });

  it("1000 random byte strings never throw, and whatever claims to be assemblable is", () => {
    const rand = mulberry32(7);
    for (let n = 0; n < 1000; n++) {
      const hex = Array.from({ length: 1 + Math.floor(rand() * 80) }, () => Math.floor(rand() * 256).toString(16).padStart(2, "0")).join("");
      const dis = decode(hex);
      if (dis.assemblable && dis.instructions.length) {
        expect(verifyRoundTrip(toAsm(dis, buildNames(dis, null, 0), provenance), dis, hex)).toEqual({ ok: true });
      }
    }
  });
});

describe("toAsm", () => {
  it("puts provenance in single-line comments that cannot inject asm", () => {
    const dis = decode("28");
    const asm = toAsm(dis, buildNames(dis, null, 0), { ...provenance, contractRS: "S-X\n^declare evil", labelsFile: "a\r\nFIN" });
    expect(asm.split("\n").filter((l) => l.startsWith("^declare"))).toEqual([]);
    expect(asm.split("\n").filter((l) => l.trim() === "FIN")).toHaveLength(1);
    expect(asm.startsWith("^comment ")).toBe(true);
  });

  it("refuses a listing that is not assemblable", () => {
    const dis = decode("ff");
    expect(() => toAsm(dis, buildNames(dis, null, 0), provenance)).toThrow();
  });

  it("reports the first differing byte", () => {
    const dis = decode("28");
    expect(verifyRoundTrip("FIN\n", dis, "29")).toEqual({ ok: false, reason: "differs", byte: 0 });
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `bun test src/features/inspector/disasm/round-trip.test.ts`
Expected: FAIL, `Cannot find module './to-asm'`.

- [ ] **Step 4: Implement**

`src/features/inspector/disasm/to-asm.ts`:

```ts
import type { Disassembly, InstructionRow, Operand } from "./decode";
import type { Names } from "./names";

/**
 * Assembly the SmartC assembler takes back. Every slot is declared in index
 * order, gaps included, because declaration order is what assigns
 * addresses. The header names where the code came from: it does not stop a
 * clone, but it keeps an honest copy honest, and a clone gets a different
 * code hash than the original anyway.
 */

export interface Provenance {
  contractId: string;
  contractRS: string;
  network: string;
  codeHash: string;
  creatorRS: string;
  date: Date;
  labelsFile: string | null;
}

interface NameLookup {
  slot(index: number): string;
  target(address: number): string;
}

export function operandText(o: Operand, names: NameLookup): string {
  switch (o.kind) {
    case "slot":
      return names.slot(o.index);
    case "const":
      return o.value.toString(16).padStart(16, "0");
    case "target":
      return names.target(o.address);
    case "api":
      return o.name;
  }
}

export function renderInstruction(row: InstructionRow, names: NameLookup): string {
  return row.form.parts.map((p) => (typeof p === "string" ? p : operandText(row.operands[p]!, names))).join("");
}

/** One line, whatever the input: a newline in a name must not become an asm line. */
const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ").trim();

export function toAsm(dis: Disassembly, names: Names, p: Provenance): string {
  if (!dis.assemblable) throw new Error("listing is not assemblable"); // i18n-ignore — callers disable export first
  const lookup: NameLookup = {
    slot: (i) => names.slotAsm[i]!,
    target: (a) => names.targetAsm.get(a)!,
  };
  // i18n-ignore — the header is part of the exported file, not the UI
  const lines = [
    `^comment ${oneLine(`Disassembled from contract ${p.contractId} (${p.contractRS}) on ${p.network}`)}`,
    `^comment ${oneLine(`Code hash ${p.codeHash} · creator ${p.creatorRS} · ${p.date.toISOString()}`)}`,
    `^comment ${oneLine(`Labels: ${p.labelsFile ?? "none"} (manual and imported names are claims, not verified)`)}`,
    ...names.slotAsm.map((name) => `^declare ${name}`),
  ];
  for (const row of dis.instructions) {
    const label = names.targetAsm.get(row.address);
    if (label) lines.push(`${label}:`);
    lines.push(renderInstruction(row, lookup));
  }
  return lines.join("\n") + "\n";
}
```

`src/features/inspector/disasm/verify.ts`:

```ts
import { SmartC } from "smartc-signum-compiler";
import type { Disassembly } from "./decode";

/**
 * The proof behind "this listing is the contract": assemble it with SmartC
 * and compare the bytes with the code on chain, without its page padding.
 */

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "compile"; message: string }
  | { ok: false; reason: "differs"; byte: number };

export function verifyRoundTrip(asm: string, dis: Disassembly, originalHex: string): VerifyResult {
  let bytecode: string;
  try {
    const compiler = new SmartC({ language: "Assembly", sourceCode: asm });
    compiler.compile();
    bytecode = compiler.getMachineCode().ByteCode.toLowerCase();
  } catch (e) {
    return { ok: false, reason: "compile", message: (e as Error)?.message ?? String(e) };
  }
  const expected = originalHex.trim().toLowerCase().slice(0, dis.codeLength * 2);
  if (bytecode === expected) return { ok: true };
  let byte = 0;
  while (byte * 2 < Math.min(bytecode.length, expected.length) && bytecode.slice(byte * 2, byte * 2 + 2) === expected.slice(byte * 2, byte * 2 + 2)) byte++;
  return { ok: false, reason: "differs", byte };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `bun test src/features/inspector/disasm/round-trip.test.ts`
Expected: PASS.

If a source fails "with labels", the cause is almost certainly naming: a label name that sanitizes into something the assembler rejects or misreads. Use systematic-debugging:
1. Print the failing `asm`.
2. Assemble it by hand with `bun -e`.
3. Fix `sanitize` or `buildNames`.
4. Add the case to `names.test.ts` (Review Focus 2).

If the random-program test fails, the `n` in the failure names the case. The seed is fixed, so it reproduces.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/inspector/disasm
git commit -m "feat(inspector): assemblable output with provenance, proven by a SmartC round trip

Round trip covers every repo contract (with and without generated labels),
the real testnet stock contract, 300 random valid programs and 1000 random
byte strings.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Outline

**Files:**
- Create: `src/features/inspector/disasm/outline.ts`
- Create: `src/features/inspector/disasm/__fixtures__/outline.smart.c`
- Test: `src/features/inspector/disasm/outline.test.ts`

**Interfaces:**
- Consumes: `Disassembly`, `InstructionRow` (Task 2); `BRANCH_MNEMONICS` (Task 1)
- Produces:
  - `type EntryKind = "start" | "restart" | "error" | "function"`
  - `interface Section { address: number; end: number; kinds: EntryKind[]; callers: number[] }`
  - `interface Outline { sections: Section[]; blockStarts: Set<number> }`
  - `buildOutline(dis: Disassembly): Outline`

- [ ] **Step 1: Write the fixture and the failing test**

`src/features/inspector/disasm/__fixtures__/outline.smart.c`:

```c
#program name Outline
#pragma version 2.3.0

long total;

void main(void) {
    add(1);
    add(2);
}

void add(long value) {
    total += value;
}
```

`src/features/inspector/disasm/outline.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SmartC } from "smartc-signum-compiler";
import { decode } from "./decode";
import { buildOutline } from "./outline";

function compiled(file: string) {
  const c = new SmartC({ language: "C", sourceCode: readFileSync(join(import.meta.dir, "__fixtures__", file), "utf8") });
  c.compile();
  return c.getMachineCode();
}

describe("buildOutline", () => {
  it("finds start, restart, functions with callers, and sections that tile the code", () => {
    const mc = compiled("outline.smart.c");
    const dis = decode(mc.ByteCode);
    const outline = buildOutline(dis);
    const addAt = mc.Labels.find((l) => l.label === "__fn_add")!.address;

    expect(outline.sections[0]).toMatchObject({ address: 0 });
    expect(outline.sections[0]!.kinds).toContain("start");
    expect(outline.sections.some((s) => s.kinds.includes("restart"))).toBe(true);
    const add = outline.sections.find((s) => s.address === addAt)!;
    expect(add.kinds).toContain("function");
    expect(add.callers).toHaveLength(2);

    for (let i = 1; i < outline.sections.length; i++) {
      expect(outline.sections[i - 1]!.end).toBe(outline.sections[i]!.address);
    }
    expect(outline.sections.at(-1)!.end).toBe(dis.codeLength);
  });

  it("starts a block at every target and after every jump or end", () => {
    // 0: BZR $0 :12 · 6: INC @0 · 11: FIN · 12: INC @0
    const dis = decode("1b" + "00000000" + "0c" + "04" + "00000000" + "28" + "04" + "00000000");
    const { blockStarts } = buildOutline(dis);
    // 6 follows a branch, 12 is the branch target and follows FIN
    expect([...blockStarts].sort((a, b) => a - b)).toEqual([0, 6, 12]);
  });

  it("marks ERR targets as error handlers", () => {
    const dis = decode("2b" + "05000000" + "28"); // ERR :5 · FIN
    expect(buildOutline(dis).sections.find((s) => s.address === 5)!.kinds).toEqual(["error"]);
  });
});
```

SmartC puts `PCS` at address 0 for this program (`PCS | SET @add_value … | JSR :__fn_add | … | FIN | __fn_add: …`), so the restart point is address 1. That was verified while planning.

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/inspector/disasm/outline.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/features/inspector/disasm/outline.ts`:

```ts
import type { Disassembly } from "./decode";
import { BRANCH_MNEMONICS } from "./opcode-index";

/**
 * Where a reader starts. Entry points are unambiguous in AT code — address 0,
 * the instruction after `PCS` (where every later run resumes), `ERR` targets
 * and `JSR` targets — and sections run from one entry to the next. SmartC
 * lays functions out contiguously, so for its code a section is a C
 * function; for hand-made or SmartJ code it is a reading aid, nothing more.
 */

export type EntryKind = "start" | "restart" | "error" | "function";

export interface Section {
  address: number;
  /** Exclusive. */
  end: number;
  kinds: EntryKind[];
  /** Addresses of the `JSR`s that call this section. */
  callers: number[];
}

export interface Outline {
  sections: Section[];
  blockStarts: Set<number>;
}

const ENDS_BLOCK = new Set(["JMP", "RET", "FIN", "STP", ...BRANCH_MNEMONICS]); // i18n-ignore

export function buildOutline(dis: Disassembly): Outline {
  const instructions = dis.instructions;
  const starts = new Set(instructions.map((i) => i.address));
  const entries = new Map<number, { kinds: Set<EntryKind>; callers: number[] }>();
  const add = (address: number, kind: EntryKind) => {
    if (!starts.has(address)) return null;
    const entry = entries.get(address) ?? { kinds: new Set<EntryKind>(), callers: [] };
    entry.kinds.add(kind);
    entries.set(address, entry);
    return entry;
  };

  add(0, "start");
  const blockStarts = new Set<number>(starts.has(0) ? [0] : []);
  instructions.forEach((instr, k) => {
    const next = instructions[k + 1];
    const target = instr.operands.find((o) => o.kind === "target");
    const mnemonic = instr.form.mnemonic;
    if (mnemonic === "PCS" && next) add(next.address, "restart");
    if (target?.kind === "target") {
      if (mnemonic === "ERR") add(target.address, "error");
      if (mnemonic === "JSR") add(target.address, "function")?.callers.push(instr.address);
      if (starts.has(target.address)) blockStarts.add(target.address);
    }
    if (ENDS_BLOCK.has(mnemonic) && next) blockStarts.add(next.address);
  });

  const sorted = [...entries.entries()].sort(([a], [b]) => a - b);
  const sections = sorted.map(([address, entry], k) => ({
    address,
    end: sorted[k + 1]?.[0] ?? dis.codeLength,
    kinds: [...entry.kinds],
    callers: entry.callers,
  }));
  return { sections, blockStarts };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/features/inspector/disasm/outline.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/disasm
git commit -m "feat(inspector): code outline — entry points, sections and basic blocks

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Cross-references and capabilities

**Files:**
- Create: `src/features/inspector/disasm/xrefs.ts`
- Create: `src/features/inspector/disasm/capabilities.ts`
- Test: `src/features/inspector/disasm/xrefs.test.ts`

**Interfaces:**
- Consumes: `Disassembly`, `Access` (Tasks 1, 2)
- Produces:
  - `interface SlotRef { address: number; access: Access }`
  - `type JumpKind = "jump" | "branch" | "call" | "error"`
  - `interface Xrefs { slots: Map<number, SlotRef[]>; writesThrough: { address: number; pointer: number }[]; incoming: Map<number, { from: number; kind: JumpKind }[]>; api: Map<string, number[]> }`
  - `buildXrefs(dis: Disassembly): Xrefs`
  - `slotUse(xrefs: Xrefs, index: number): { reads: number[]; writes: number[] }` (instruction addresses; a readwrite access counts in both)
  - `type Capability = "sendsFunds" | "assets" | "writesMaps" | "readsMaps" | "readsBalances" | "crypto"`
  - `CAPABILITY_APIS: Record<Capability, readonly string[]>`
  - `capabilities(xrefs: Xrefs): { capability: Capability; apis: string[]; sites: number[] }[]` (only those present, in `CAPABILITY_APIS` order)

- [ ] **Step 1: Write the failing test**

`src/features/inspector/disasm/xrefs.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SmartC } from "smartc-signum-compiler";
import { capabilities, CAPABILITY_APIS } from "./capabilities";
import { decode } from "./decode";
import { API_BY_CODE } from "./opcode-index";
import { buildXrefs, slotUse } from "./xrefs";

const hex =
  "02" + "02000000" + "01000000" + // 0: SET @2 $1
  "06" + "02000000" + "01000000" + // 9: ADD @2 $1
  "14" + "03000000" + "01000000" + // 18: SET @($3) $1
  "12" + "1b000000" + // 27: JSR :27
  "32" + "0304" + // 32: FUN send_All_to_Address_in_B
  "28"; // 35: FIN
const xrefs = buildXrefs(decode(hex));

describe("buildXrefs", () => {
  it("records reads and writes per slot", () => {
    expect(slotUse(xrefs, 2)).toEqual({ reads: [9], writes: [0, 9] });
    expect(slotUse(xrefs, 1)).toEqual({ reads: [0, 9, 18], writes: [] });
    expect(slotUse(xrefs, 3)).toEqual({ reads: [18], writes: [] });
  });

  it("records writes through pointers separately", () => {
    expect(xrefs.writesThrough).toEqual([{ address: 18, pointer: 3 }]);
  });

  it("records incoming jumps and API call sites", () => {
    expect(xrefs.incoming.get(27)).toEqual([{ from: 27, kind: "call" }]);
    expect(xrefs.api.get("send_All_to_Address_in_B")).toEqual([32]);
  });

  it("derives capabilities from API calls only", () => {
    expect(capabilities(xrefs)).toEqual([{ capability: "sendsFunds", apis: ["send_All_to_Address_in_B"], sites: [32] }]);
  });
});

describe("capability table", () => {
  it("only names API functions the toolchain knows", () => {
    const known = new Set([...API_BY_CODE.values()].map((a) => a.name));
    expect(Object.values(CAPABILITY_APIS).flat().filter((n) => !known.has(n))).toEqual([]);
  });

  it("finds something in a real contract", () => {
    const source = readFileSync(join(import.meta.dir, "../../../../../../examples/stock.smart.c"), "utf8");
    const c = new SmartC({ language: "C", sourceCode: source });
    c.compile();
    expect(capabilities(buildXrefs(decode(c.getMachineCode().ByteCode))).length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/inspector/disasm/xrefs.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/features/inspector/disasm/xrefs.ts`:

```ts
import type { Disassembly } from "./decode";
import type { Access } from "./opcode-index";

/**
 * Who touches what. For an unknown contract this is how a slot gets its
 * meaning: the instructions that write it, and the API calls next to them.
 */

export interface SlotRef {
  address: number;
  access: Access;
}

export type JumpKind = "jump" | "branch" | "call" | "error";

export interface Xrefs {
  slots: Map<number, SlotRef[]>;
  writesThrough: { address: number; pointer: number }[];
  incoming: Map<number, { from: number; kind: JumpKind }[]>;
  api: Map<string, number[]>;
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => map.set(key, [...(map.get(key) ?? []), value]);

export function buildXrefs(dis: Disassembly): Xrefs {
  const xrefs: Xrefs = { slots: new Map(), writesThrough: [], incoming: new Map(), api: new Map() };
  for (const instr of dis.instructions) {
    const mnemonic = instr.form.mnemonic;
    let pointerNoted = false;
    for (const o of instr.operands) {
      if (o.kind === "slot") {
        push(xrefs.slots, o.index, { address: instr.address, access: o.access });
        if (o.writesThrough && !pointerNoted) {
          xrefs.writesThrough.push({ address: instr.address, pointer: o.index });
          pointerNoted = true;
        }
      } else if (o.kind === "target") {
        const kind: JumpKind = mnemonic === "JSR" ? "call" : mnemonic === "ERR" ? "error" : mnemonic === "JMP" ? "jump" : "branch";
        push(xrefs.incoming, o.address, { from: instr.address, kind });
      } else if (o.kind === "api") {
        push(xrefs.api, o.name, instr.address);
      }
    }
  }
  return xrefs;
}

export function slotUse(xrefs: Xrefs, index: number): { reads: number[]; writes: number[] } {
  const refs = xrefs.slots.get(index) ?? [];
  return {
    reads: refs.filter((r) => r.access !== "write").map((r) => r.address),
    writes: refs.filter((r) => r.access !== "read").map((r) => r.address),
  };
}
```

`src/features/inspector/disasm/capabilities.ts`:

```ts
import type { Xrefs } from "./xrefs";

/**
 * What a contract can do, read from its API calls — the bytecode, never a
 * label someone wrote. "Can this contract move funds?" should not depend on
 * whether a Label Map tells the truth.
 */

export type Capability = "sendsFunds" | "assets" | "writesMaps" | "readsMaps" | "readsBalances" | "crypto";

// i18n-ignore — API function names
export const CAPABILITY_APIS: Record<Capability, readonly string[]> = {
  sendsFunds: ["send_to_Address_in_B", "send_All_to_Address_in_B", "send_Old_to_Address_in_B", "send_A_to_Address_in_B"],
  assets: ["Issue_Asset", "Mint_Asset", "Distribute_To_Asset_Holders"],
  writesMaps: ["Set_Map_Value_Keys_In_A"],
  readsMaps: ["Get_Map_Value_Keys_In_A"],
  readsBalances: ["Get_Account_Balance", "Get_Asset_Holders_Count", "Get_Asset_Circulating"],
  crypto: [
    "MD5_A_to_B", "check_MD5_A_with_B", "HASH160_A_to_B", "check_HASH160_A_with_B",
    "SHA256_A_to_B", "check_SHA256_A_with_B", "Check_Sig_B_With_A",
  ],
};

export function capabilities(xrefs: Xrefs): { capability: Capability; apis: string[]; sites: number[] }[] {
  return (Object.keys(CAPABILITY_APIS) as Capability[])
    .map((capability) => {
      const apis = CAPABILITY_APIS[capability].filter((name) => xrefs.api.has(name));
      const sites = apis.flatMap((name) => xrefs.api.get(name)!).sort((a, b) => a - b);
      return { capability, apis, sites };
    })
    .filter((c) => c.apis.length > 0);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/features/inspector/disasm/xrefs.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/disasm
git commit -m "feat(inspector): slot and jump cross-references, and capabilities from API calls

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Trust levels and D'Or MAP

**Files:**
- Create: `src/features/inspector/disasm/trust.ts`
- Create: `src/features/inspector/disasm/dor-map.ts`
- Test: `src/features/inspector/disasm/trust-dor.test.ts`

**Interfaces:**
- Consumes: `LabelMap`, `Origin` (M1); `buildNames` (Task 4); `parseLabelMap`, `upsertSlot`, `upsertCodeLabel` (M1 + Task 3); `parseDocument` (M1)
- Produces:
  - `type Trust = "verified" | "otherBuild" | "claim"`
  - `trustOf(origin: Origin | undefined, map: LabelMap, codeHash: string): Trust`
  - `interface DorMap { Memory: string[]; Labels: { label: string; address: number }[] }`
  - `DorMapSchema` (Zod)
  - `toDorMap(map: LabelMap): DorMap`
  - `parseDorMap(text: string): Parsed<DorMap>`
  - `importDorMap(labelMapText: string, dor: DorMap): { text: string; added: number }`

- [ ] **Step 1: Write the failing test**

`src/features/inspector/disasm/trust-dor.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { parseLabelMap, type LabelMap } from "../model/label-map";
import { importDorMap, parseDorMap, toDorMap } from "./dor-map";
import { trustOf } from "./trust";

const map: LabelMap = {
  version: 1, name: "m", codeHashes: [{ hash: "77" }], source: { file: "a.smart.c", generatedAt: "x", codeHash: "77" },
  slots: [{ index: 1, name: "owner", origin: "compiler" }, { index: 3, name: "my.flag", origin: "manual" }],
  maps: [], enums: {}, codeLabels: [{ address: 8, name: "__fn_main", origin: "compiler" }],
};

describe("trustOf", () => {
  it("verifies compiler labels only for the build they came from", () => {
    expect(trustOf("compiler", map, "77")).toBe("verified");
    expect(trustOf("compiler", map, "78")).toBe("otherBuild");
    expect(trustOf("manual", map, "77")).toBe("claim");
    expect(trustOf("imported", map, "77")).toBe("claim");
    expect(trustOf(undefined, map, "77")).toBe("claim");
  });
});

describe("D'Or MAP", () => {
  it("exports asm names in slot order and code labels", () => {
    expect(toDorMap(map)).toEqual({
      Memory: ["var_000", "owner", "var_002", "my_flag"],
      Labels: [{ label: "__fn_main", address: 8 }],
    });
  });

  it("imports names as claims without overwriting existing entries or importing generated names", () => {
    const text = `{ "version": 1, "name": "m", "codeHashes": [], "slots": [ { "index": 1, "name": "keep" } ] }`;
    const dor = parseDorMap(`{ "Memory": ["r0", "owner", "var02", "price"], "Labels": [{ "label": "lab_1a", "address": 26 }, { "label": "__fn_sell", "address": 40 }] }`);
    if (!dor.ok) throw new Error("fixture");
    const { text: out, added } = importDorMap(text, dor.value);
    const r = parseLabelMap(out);
    if (!r.ok) throw new Error(JSON.stringify(r.errors));
    expect(r.value.slots).toEqual([
      { index: 1, name: "keep" },
      { index: 3, name: "price", origin: "imported" },
    ]);
    expect(r.value.codeLabels).toEqual([{ address: 40, name: "__fn_sell", origin: "imported" }]);
    expect(added).toBe(2);
  });

  it("rejects something that is not a MAP", () => {
    expect(parseDorMap(`{ "Memory": "x" }`).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/inspector/disasm/trust-dor.test.ts`
Expected: FAIL, modules not found.

- [ ] **Step 3: Implement**

`src/features/inspector/disasm/trust.ts`:

```ts
import type { Origin } from "../model/formats";
import type { LabelMap } from "../model/label-map";

/**
 * How much a name can be believed. Only the compiler, for the exact build
 * this contract runs, can vouch for a name; everything a person wrote —
 * here or in a file someone shared — is a claim, shown as one.
 */

export type Trust = "verified" | "otherBuild" | "claim";

export function trustOf(origin: Origin | undefined, map: LabelMap, codeHash: string): Trust {
  if (origin !== "compiler") return "claim";
  return map.source?.codeHash === codeHash ? "verified" : "otherBuild";
}
```

`src/features/inspector/disasm/dor-map.ts`:

```ts
import { z } from "zod";
import { parseDocument, type Parsed } from "../model/jsonc";
import { parseLabelMap, type LabelMap } from "../model/label-map";
import { upsertCodeLabel, upsertSlot } from "../model/label-map-edits";
import { buildNames } from "./names";

/**
 * The name map of Signum D'Or — which is also the shape of the SmartC
 * compiler's own machine object: slot names in address order, and code
 * labels with addresses. Imported names are claims, and they never replace
 * a name the Label Map already has.
 */

export const DorMapSchema = z.object({
  Memory: z.array(z.string()),
  Labels: z.array(z.object({ label: z.string(), address: z.int().nonnegative() })).default([]),
});
export type DorMap = z.infer<typeof DorMapSchema>;

/** Names D'Or and the compiler generate on their own; importing them would only add noise. */
const GENERATED = /^(r\d+|var_?\d+|lab_[0-9a-f]+)$/;

export function toDorMap(map: LabelMap): DorMap {
  const names = buildNames(null, map, 0);
  return {
    Memory: names.slotAsm,
    Labels: map.codeLabels.map((c) => ({ label: names.targetAsm.get(c.address)!, address: c.address })),
  };
}

export function parseDorMap(text: string): Parsed<DorMap> {
  return parseDocument(text, DorMapSchema);
}

export function importDorMap(labelMapText: string, dor: DorMap): { text: string; added: number } {
  const current = parseLabelMap(labelMapText);
  if (!current.ok) throw new Error(current.errors[0]?.message ?? "invalid Label Map"); // i18n-ignore — unreachable: a failed parse always has an error
  // An array label covers every slot of its length, not just its first index.
  const taken = new Set(current.value.slots.flatMap((s) => Array.from({ length: s.length ?? 1 }, (_, k) => s.index + k)));
  const takenLabels = new Set(current.value.codeLabels.map((c) => c.address));
  let text = labelMapText;
  let added = 0;
  dor.Memory.forEach((name, index) => {
    if (GENERATED.test(name) || taken.has(index)) return;
    text = upsertSlot(text, { index, name, origin: "imported" });
    added++;
  });
  for (const l of dor.Labels) {
    if (GENERATED.test(l.label) || takenLabels.has(l.address)) continue;
    text = upsertCodeLabel(text, { address: l.address, name: l.label, origin: "imported" });
    added++;
  }
  return { text, added };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun test src/features/inspector/disasm/trust-dor.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector/disasm
git commit -m "feat(inspector): label trust levels and D'Or MAP import/export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Export and the disassembly hook

**Files:**
- Create: `src/features/inspector/workspace/export-asm.ts`
- Create: `src/features/inspector/ui/use-disassembly.ts`
- Test: `src/features/inspector/workspace/export-asm.test.ts`

**Interfaces:**
- Consumes: `decode`, `buildNames`, `buildOutline`, `buildXrefs`, `capabilities`, `toAsm`, `verifyRoundTrip` (Tasks 2–7); `createLatest` (M1 `chain/latest.ts`); `FileTypes` (M1)
- Produces:
  - `asmFileName(base: string, contractId: string, taken: string[]): string`
  - `exportAsm(fs: { listFolderContents(folderId?: string): { files: { metadata: { name: string } }[] }; addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string> }, folderId: string, base: string, contractId: string, asm: string): Promise<{ fileId: string; name: string }>`
  - `interface DisassemblyView { dis: Disassembly; names: Names; outline: Outline; xrefs: Xrefs; capabilities: ReturnType<typeof capabilities>; verify: VerifyResult | "pending" | null; asm: () => string }`
    - `verify` is `null` when the listing is not assemblable.
  - `useDisassembly(contract: Contract | null, labelMap: LabelMap | null, provenance: Omit<Provenance, "date">): DisassemblyView | null`

- [ ] **Step 1: Write the failing test**

`src/features/inspector/workspace/export-asm.test.ts`:

```ts
import { describe, expect, it } from "bun:test";
import { asmFileName, exportAsm } from "./export-asm";

describe("asm export", () => {
  it("builds a unique, path-safe name", () => {
    expect(asmFileName("vb Stock/01", "123", [])).toBe("vb-Stock_01-123.asm");
    expect(asmFileName("x", "1", ["x-1.asm"])).toBe("x-1-2.asm");
  });

  it("writes an ASM file into the folder", async () => {
    const added: { name: string; type: string; content: string }[] = [];
    const fs = {
      listFolderContents: () => ({ files: [] }),
      addFile: async <T,>(_f: string, name: string, type: string, content: T) => {
        added.push({ name, type, content: content as string });
        return "id1";
      },
    };
    expect(await exportAsm(fs, "folder", "Market", "9", "FIN\n")).toEqual({ fileId: "id1", name: "Market-9.asm" });
    expect(added).toEqual([{ name: "Market-9.asm", type: "asm", content: "FIN\n" }]);
  });
});
```

`FileTypes.ASM` is the string `"asm"` (see `features/project/filetype-icons.tsx`).

- [ ] **Step 2: Run to verify it fails**

Run: `bun test src/features/inspector/workspace/export-asm.test.ts`
Expected: FAIL, module not found.

- [ ] **Step 3: Implement**

`src/features/inspector/workspace/export-asm.ts`:

```ts
import { replaceWhitespace } from "@/lib/string";
import { uniqueName } from "@/features/project/file-naming";
import { FileTypes } from "@/features/project/filetype-icons";

/** Exports land beside the watchlist as an ordinary `.asm` file — editable, assemblable, never deployed from here. */

const EXT = ".asm";

export function asmFileName(base: string, contractId: string, taken: string[]): string {
  const safe = replaceWhitespace(base.trim() || "contract").replace(/[\\/:*?"<>|]/g, "_"); // i18n-ignore
  return uniqueName(`${safe}-${contractId}${EXT}`, taken, EXT);
}

export async function exportAsm(
  fs: {
    listFolderContents(folderId?: string): { files: { metadata: { name: string } }[] };
    addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>;
  },
  folderId: string,
  base: string,
  contractId: string,
  asm: string,
): Promise<{ fileId: string; name: string }> {
  const taken = fs.listFolderContents(folderId).files.map((f) => f.metadata.name);
  const name = asmFileName(base, contractId, taken);
  const fileId = await fs.addFile(folderId, name, FileTypes.ASM, asm);
  return { fileId, name };
}
```

`src/features/inspector/ui/use-disassembly.ts`:

```ts
import { useEffect, useMemo, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { createLatest } from "../chain/latest";
import type { LabelMap } from "../model/label-map";
import { slotCount } from "../model/data-stack";
import { capabilities } from "../disasm/capabilities";
import { decode, type Disassembly } from "../disasm/decode";
import { buildNames, type Names } from "../disasm/names";
import { buildOutline, type Outline } from "../disasm/outline";
import { toAsm, type Provenance } from "../disasm/to-asm";
import { verifyRoundTrip, type VerifyResult } from "../disasm/verify";
import { buildXrefs, type Xrefs } from "../disasm/xrefs";

export interface DisassemblyView {
  dis: Disassembly;
  names: Names;
  outline: Outline;
  xrefs: Xrefs;
  capabilities: ReturnType<typeof capabilities>;
  /** null: not assemblable, so there is nothing to verify. */
  verify: VerifyResult | "pending" | null;
  asm: () => string;
}

/**
 * Everything the Code tab shows, computed once per contract and Label Map.
 * Verification runs the SmartC assembler, so it runs after the first paint,
 * and only the newest contract's answer is kept: a slow verify of the
 * contract the user just left must not land on the one they opened.
 */
export function useDisassembly(
  contract: Contract | null,
  labelMap: LabelMap | null,
  provenance: Omit<Provenance, "date">,
): DisassemblyView | null {
  const code = contract?.machineCode ?? "";
  const dataSlots = contract ? slotCount(contract.machineData) : 0;

  const base = useMemo(() => {
    if (!code) return null;
    const dis = decode(code);
    const names = buildNames(dis, labelMap, dataSlots);
    const xrefs = buildXrefs(dis);
    return { dis, names, outline: buildOutline(dis), xrefs, capabilities: capabilities(xrefs) };
  }, [code, labelMap, dataSlots]);

  const asm = useMemo(
    () => () => (base ? toAsm(base.dis, base.names, { ...provenance, date: new Date() }) : ""),
    // Provenance fields are plain strings; compare them, not the object identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [base, provenance.contractId, provenance.network, provenance.labelsFile, provenance.codeHash],
  );

  const [latest] = useState(createLatest);
  const [verify, setVerify] = useState<VerifyResult | "pending" | null>(null);
  useEffect(() => {
    if (!base?.dis.assemblable) {
      setVerify(null);
      return;
    }
    setVerify("pending");
    const work = new Promise<VerifyResult>((resolve) =>
      setTimeout(() => resolve(verifyRoundTrip(asm(), base.dis, code)), 0),
    );
    latest(work).then(({ current, value }) => current && setVerify(value));
  }, [base, asm, code, latest]);

  return base ? { ...base, verify, asm } : null;
}
```

- [ ] **Step 4: Run tests and typecheck**

Run: `bun test src/features/inspector/workspace/export-asm.test.ts && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep features/inspector`
Expected: PASS; no inspector type errors.

The latest-only guard is `createLatest`, already proven by M1's `latest.test.ts`. The hook adds no logic of its own that a unit test without a DOM could reach. Review Focus 5 is pinned by reusing that tested guard; record this in the ledger.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/inspector
git commit -m "feat(inspector): asm export and the disassembly view hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Code tab

**Files:**
- Create: `src/features/inspector/ui/trust-badge.tsx`
- Create: `src/features/inspector/ui/code-label-dialog.tsx`
- Create: `src/features/inspector/ui/code-outline.tsx`
- Create: `src/features/inspector/ui/code-listing.tsx`
- Create: `src/features/inspector/ui/code-detail.tsx`
- Create: `src/features/inspector/ui/code-tab.tsx`
- Modify: `src/features/inspector/ui/contract-view.tsx`
- Modify: `src/i18n/locales/en/inspector.json`

**Interfaces:**
- Consumes: `useDisassembly`, `DisassemblyView` (Task 9); `renderInstruction`, `operandText` (Task 5); `trustOf`, `Trust` (Task 8); `slotUse` (Task 7); `exportAsm` (Task 9); `upsertCodeLabel` (Task 3); `SlotLabelDialog`, `upsertSlot`, `updateFileText`, `formatValue`, `slotToBigInt`, `ROW_SELECTED`, `ROW_HOVER`, `networkLabel` (M1); `AsmOpcodes` (asm-editor)
- Produces:
  - `<TrustBadge trust={Trust} />`
  - `<CodeLabelDialog open onOpenChange address={number} initial={string} onSave={(name: string) => void} onRemove?={() => void} />`
  - `type CodeSelection = { kind: "instruction"; address: number } | { kind: "slot"; index: number } | { kind: "target"; address: number }`
  - `<CodeTab contract labelMap={IndexedLabelMap | null} entry={WatchEntry} folderId={string} prefix ensureLabelMap focus={CodeFocus | null} onShowSlot={(index: number) => void} />`
  - `type CodeFocus = { slot?: number; address?: number; nonce: number }`

- [ ] **Step 1: Add the English strings**

Merge into `src/i18n/locales/en/inspector.json`. Keep every existing key, add `"code"` to `contract.tabs`, and add these top-level objects:

```json
{
  "contract": { "tabs": { "code": "Code" } },
  "code": {
    "noCode": "This node did not return the contract's code. Choose another node.",
    "empty": "This contract has no code.",
    "size": "{bytes} bytes · {instructions} instructions · {pages} code pages",
    "verifyPending": "Checking that the listing re-assembles…",
    "verifyOk": "Re-assembles to identical code",
    "verifyDiffers": "Re-assembled code differs from byte {byte}",
    "verifyCompile": "Does not re-assemble: {message}",
    "notAssemblable": "Not assemblable: {count} unknown bytes or misaligned targets",
    "export": "Export as .asm",
    "exportDisabled": "Export needs a listing that re-assembles to identical code",
    "exported": "Exported to {name}",
    "open": "Open",
    "outline": "Outline",
    "back": "Back",
    "showBytes": "Bytes",
    "showValues": "Values",
    "padding": "padding, {count} bytes",
    "unknown": "unknown byte {byte} ({reason})",
    "reason": { "opcode": "no such opcode", "api": "unknown API function", "slot": "slot out of range", "truncated": "cut off" },
    "misaligned": "jumps into the middle of an instruction",
    "kinds": { "start": "Start", "restart": "Restart", "error": "Error handler", "function": "Function" },
    "callers": { "one": "{count} caller", "other": "{count} callers" },
    "select": "Select an instruction, a slot or a jump target.",
    "steps": "{steps} steps",
    "reads": "Read by",
    "writes": "Written by",
    "writesThrough": "Writes through pointer {name}",
    "incoming": "Reached from",
    "currentValue": "Current value",
    "nameLocation": "Name this location",
    "showInData": "Show in data stack",
    "jumpKinds": { "jump": "jump", "branch": "branch", "call": "call", "error": "error handler" },
    "none": "none",
    "caps": {
      "title": "This contract can",
      "nothing": "No funds, assets, maps or hashing calls found.",
      "sendsFunds": "send SIGNA or tokens",
      "assets": "issue, mint or distribute tokens",
      "writesMaps": "write its maps",
      "readsMaps": "read maps",
      "readsBalances": "read balances and token holders",
      "crypto": "hash or check signatures"
    }
  },
  "codeLabel": {
    "title": "Name address {address}",
    "name": "Name",
    "save": "Save",
    "remove": "Remove name",
    "saved": "Location named"
  },
  "trust": {
    "verified": "Verified: generated by the compiler for exactly this code",
    "otherBuild": "From the compiler, but for another build of this code",
    "claim": "A claim: written by hand or imported, not verified"
  }
}
```

Merge them with a small script, never by overwriting the file. Deep-merge `contract.tabs.code`. Then run `bun run i18n:types`.

- [ ] **Step 2: Trust badge and code-label dialog**

`src/features/inspector/ui/trust-badge.tsx`:

```tsx
import { BadgeCheck, CircleHelp, GitBranch } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { t } from "@/i18n/runtime";
import type { Trust } from "../disasm/trust";

const ICONS = { verified: BadgeCheck, otherBuild: GitBranch, claim: CircleHelp } as const;

export function trustText(trust: Trust): string {
  switch (trust) {
    case "verified":
      return t("inspector.trust.verified");
    case "otherBuild":
      return t("inspector.trust.otherBuild");
    case "claim":
      return t("inspector.trust.claim");
  }
}

/** A name's provenance at a glance; the tooltip says it in words. */
export function TrustBadge({ trust }: { trust: Trust }) {
  const Icon = ICONS[trust];
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          aria-label={trustText(trust)}
          className={trust === "verified" ? "text-[var(--green)]" : "text-muted-foreground"}
        >
          <Icon className="inline h-3.5 w-3.5" />
        </span>
      </TooltipTrigger>
      <TooltipContent>{trustText(trust)}</TooltipContent>
    </Tooltip>
  );
}
```

`Tooltip` in `@/components/ui/tooltip` wraps its own `TooltipProvider`, so no app-level provider is needed. That was verified while planning.

`src/features/inspector/ui/code-label-dialog.tsx`:

```tsx
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitOnEnter } from "@/components/ui/submit-on-enter";
import { t } from "@/i18n/runtime";

export function CodeLabelDialog({
  open,
  onOpenChange,
  address,
  initial,
  onSave,
  onRemove,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  address: number;
  initial: string;
  onSave: (name: string) => void;
  onRemove?: () => void;
}) {
  const [name, setName] = useState(initial);
  useEffect(() => {
    if (open) setName(initial);
  }, [open, initial]);
  const canSave = name.trim().length > 0;
  const save = () => {
    if (!canSave) return;
    onSave(name.trim());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <SubmitOnEnter onSubmit={save} isEnabled={canSave}>
          <DialogHeader>
            <DialogTitle>{t("inspector.codeLabel.title", { address: `0x${address.toString(16).padStart(4, "0")}` })}</DialogTitle>
          </DialogHeader>
          <div className="my-3 flex flex-col gap-2">
            <Label htmlFor="code-label-name">{t("inspector.codeLabel.name")}</Label>
            <Input id="code-label-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <DialogFooter>
            {onRemove && (
              <Button variant="ghost" onClick={() => { onRemove(); onOpenChange(false); }}>
                {t("inspector.codeLabel.remove")}
              </Button>
            )}
            <Button onClick={save} disabled={!canSave}>
              {t("inspector.codeLabel.save")}
            </Button>
          </DialogFooter>
        </SubmitOnEnter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Outline, listing and detail**

`src/features/inspector/ui/code-outline.tsx`:

```tsx
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";
import type { EntryKind, Outline } from "../disasm/outline";
import type { Names } from "../disasm/names";
import { ROW_HOVER } from "./selection";

export function kindLabel(kind: EntryKind): string {
  switch (kind) {
    case "start":
      return t("inspector.code.kinds.start");
    case "restart":
      return t("inspector.code.kinds.restart");
    case "error":
      return t("inspector.code.kinds.error");
    case "function":
      return t("inspector.code.kinds.function");
  }
}

export function CodeOutline({
  outline,
  names,
  onGo,
}: {
  outline: Outline;
  names: Names;
  onGo: (address: number) => void;
}) {
  return (
    <nav className="w-56 shrink-0 overflow-auto border-r p-2 text-sm" aria-label={t("inspector.code.outline")}>
      <h3 className="mb-1 px-1 text-xs font-semibold uppercase text-muted-foreground">{t("inspector.code.outline")}</h3>
      <ul>
        {outline.sections.map((s) => (
          <li key={s.address}>
            <button
              type="button"
              onClick={() => onGo(s.address)}
              className={cn("flex w-full flex-col items-start rounded px-1 py-1 text-left", ROW_HOVER)}
            >
              <span className="truncate font-mono">{names.targetDisplay.get(s.address) ?? kindLabel(s.kinds[0]!)}</span>
              <span className="text-xs text-muted-foreground">
                {s.kinds.map(kindLabel).join(" · ")}
                {s.callers.length > 0 && ` · ${t("inspector.code.callers", { count: s.callers.length })}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

`src/features/inspector/ui/code-listing.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";
import { AsmOpcodes } from "@/features/asm-editor/code-editor/language-definitions/opcodes";
import { formatValue, slotToBigInt } from "../model/decode";
import type { DisassemblyView } from "./use-disassembly";
import type { CodeSelection } from "./code-detail";
import { ROW_HOVER, ROW_SELECTED } from "./selection";

const hex4 = (n: number) => n.toString(16).padStart(4, "0");

export function CodeListing({
  view,
  machineData,
  prefix,
  enums,
  selection,
  highlight,
  showBytes,
  showValues,
  scrollTo,
  onSelect,
}: {
  view: DisassemblyView;
  machineData: string;
  prefix: "S" | "TS";
  enums: Record<string, Record<string, string>>;
  selection: CodeSelection | null;
  /** Instruction addresses to mark, e.g. the writers of a slot. */
  highlight: Set<number>;
  showBytes: boolean;
  showValues: boolean;
  scrollTo: number | null;
  onSelect: (selection: CodeSelection) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollTo === null) return;
    container.current?.querySelector(`[data-address="${scrollTo}"]`)?.scrollIntoView({ block: "center" });
  }, [scrollTo]);

  const { dis, names, outline } = view;
  const slotValue = (index: number) => {
    const hex = machineData.slice(index * 16, index * 16 + 16);
    if (hex.length < 16) return null;
    const label = names.slotLabel[index];
    return formatValue(slotToBigInt(hex), label?.format ?? "long", { prefix, enums, enumName: label?.enum });
  };

  return (
    <div ref={container} className="min-h-0 flex-1 overflow-auto font-mono text-xs">
      {dis.rows.map((row) => {
        if (row.kind === "padding") {
          return (
            <div key={`p${row.address}`} className="px-3 py-1 text-muted-foreground">
              {hex4(row.address)} · {t("inspector.code.padding", { count: row.size })}
            </div>
          );
        }
        if (row.kind === "unknown") {
          return (
            <div key={`u${row.address}`} className="px-3 py-0.5 text-[var(--amber)]">
              {hex4(row.address)} {t("inspector.code.unknown", { byte: row.bytes, reason: reasonText(row.reason) })}
            </div>
          );
        }
        const selected =
          (selection?.kind === "instruction" || selection?.kind === "target") && selection.address === row.address;
        const label = names.targetAsm.has(row.address) ? names.targetDisplay.get(row.address) : null;
        const doc = AsmOpcodes[row.form.mnemonic];
        return (
          <div key={row.address} data-address={row.address}>
            {outline.blockStarts.has(row.address) && row.address !== 0 && <div className="mx-3 border-t border-dashed" />}
            {label && (
              <button
                type="button"
                className="block px-3 pt-1 text-left text-[var(--accent-2)]"
                onClick={() => onSelect({ kind: "target", address: row.address })}
              >
                {label}:
              </button>
            )}
            <div
              className={cn(
                "flex cursor-pointer gap-3 px-3 py-0.5",
                ROW_HOVER,
                selected && ROW_SELECTED,
                highlight.has(row.address) && !selected && "bg-[color-mix(in_srgb,var(--accent-2)_10%,transparent)]",
              )}
              onClick={() => onSelect({ kind: "instruction", address: row.address })}
            >
              <span className="w-10 shrink-0 text-muted-foreground">{hex4(row.address)}</span>
              {showBytes && <span className="w-56 shrink-0 truncate text-muted-foreground">{row.bytes}</span>}
              <span title={doc ? `${doc.title} · ${t("inspector.code.steps", { steps: doc.stepFee })}` : undefined} className="w-10 shrink-0 font-semibold">
                {row.form.mnemonic}
              </span>
              <span className="min-w-0 flex-1">
                {row.form.parts.map((part, k) => {
                  // The mnemonic has its own column; the first literal starts with it.
                  if (typeof part === "string") return <span key={k}>{k === 0 ? part.slice(row.form.mnemonic.length) : part}</span>;
                  const o = row.operands[part]!;
                  if (o.kind === "slot") {
                    const value = showValues ? slotValue(o.index) : null;
                    return (
                      <button
                        key={k}
                        type="button"
                        className="underline decoration-dotted"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect({ kind: "slot", index: o.index });
                        }}
                      >
                        {names.slotDisplay[o.index] ?? names.slotAsm[o.index]}
                        {value !== null && <span className="text-muted-foreground"> ={value}</span>}
                      </button>
                    );
                  }
                  if (o.kind === "target") {
                    return (
                      <button
                        key={k}
                        type="button"
                        className="text-[var(--accent-2)] underline decoration-dotted"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect({ kind: "target", address: o.address });
                        }}
                      >
                        {names.targetDisplay.get(o.address)}
                      </button>
                    );
                  }
                  return <span key={k}>{o.kind === "const" ? o.value.toString(16).padStart(16, "0") : o.name}</span>;
                })}
              </span>
              {dis.misaligned.includes(row.address) && <span className="text-[var(--amber)]">{t("inspector.code.misaligned")}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function reasonText(reason: "opcode" | "api" | "slot" | "truncated"): string {
  switch (reason) {
    case "opcode":
      return t("inspector.code.reason.opcode");
    case "api":
      return t("inspector.code.reason.api");
    case "slot":
      return t("inspector.code.reason.slot");
    case "truncated":
      return t("inspector.code.reason.truncated");
  }
}
```

`src/features/inspector/ui/code-detail.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { t } from "@/i18n/runtime";
import { formatValue, slotToBigInt } from "../model/decode";
import type { LabelMap } from "../model/label-map";
import { trustOf } from "../disasm/trust";
import { slotUse, type JumpKind } from "../disasm/xrefs";
import { TrustBadge } from "./trust-badge";
import type { DisassemblyView } from "./use-disassembly";

export type CodeSelection =
  | { kind: "instruction"; address: number }
  | { kind: "slot"; index: number }
  | { kind: "target"; address: number };

const hex4 = (n: number) => `0x${n.toString(16).padStart(4, "0")}`;

function jumpKindText(kind: JumpKind): string {
  switch (kind) {
    case "jump":
      return t("inspector.code.jumpKinds.jump");
    case "branch":
      return t("inspector.code.jumpKinds.branch");
    case "call":
      return t("inspector.code.jumpKinds.call");
    case "error":
      return t("inspector.code.jumpKinds.error");
  }
}

function AddressList({ addresses, onGo }: { addresses: number[]; onGo: (a: number) => void }) {
  if (addresses.length === 0) return <span className="text-muted-foreground">{t("inspector.code.none")}</span>;
  return (
    <span className="flex flex-wrap gap-1">
      {addresses.map((a) => (
        <button key={a} type="button" className="font-mono underline decoration-dotted" onClick={() => onGo(a)}>
          {hex4(a)}
        </button>
      ))}
    </span>
  );
}

export function CodeDetail({
  view,
  selection,
  map,
  codeHash,
  machineData,
  prefix,
  onGo,
  onLabelSlot,
  onNameLocation,
  onShowInData,
}: {
  view: DisassemblyView;
  selection: CodeSelection | null;
  map: LabelMap | null;
  codeHash: string;
  machineData: string;
  prefix: "S" | "TS";
  onGo: (address: number) => void;
  onLabelSlot: (index: number) => void;
  onNameLocation: (address: number) => void;
  onShowInData: (index: number) => void;
}) {
  if (!selection) return <p className="p-3 text-xs text-muted-foreground">{t("inspector.code.select")}</p>;
  const { names, xrefs, dis } = view;

  if (selection.kind === "slot") {
    const { index } = selection;
    const { reads, writes } = slotUse(xrefs, index);
    const label = names.slotLabel[index];
    const hex = machineData.slice(index * 16, index * 16 + 16);
    const through = xrefs.writesThrough.filter((w) => w.pointer === index).map((w) => w.address);
    return (
      <div className="flex flex-col gap-3 p-3 text-sm">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono">
            #{index} {names.slotDisplay[index] ?? names.slotAsm[index]}{" "}
            {label && map && <TrustBadge trust={trustOf(label.origin, map, codeHash)} />}
          </span>
          <Button size="sm" variant="outline" onClick={() => onLabelSlot(index)}>
            {label ? t("inspector.data.editLabel") : t("inspector.data.setLabel")}
          </Button>
        </div>
        {label?.comment && <p className="text-muted-foreground">{label.comment}</p>}
        {hex.length === 16 && (
          <p>
            {t("inspector.code.currentValue")}:{" "}
            <span className="font-mono">
              {formatValue(slotToBigInt(hex), label?.format ?? "long", { prefix, enums: map?.enums ?? {}, enumName: label?.enum })}
            </span>
          </p>
        )}
        <p>{t("inspector.code.writes")}: <AddressList addresses={writes} onGo={onGo} /></p>
        <p>{t("inspector.code.reads")}: <AddressList addresses={reads} onGo={onGo} /></p>
        {through.length > 0 && (
          <p>
            {t("inspector.code.writesThrough", { name: names.slotDisplay[index] ?? names.slotAsm[index] })}:{" "}
            <AddressList addresses={through} onGo={onGo} />
          </p>
        )}
        <Button size="sm" variant="ghost" className="self-start" onClick={() => onShowInData(index)}>
          {t("inspector.code.showInData")}
        </Button>
      </div>
    );
  }

  const address = selection.address;
  const incoming = xrefs.incoming.get(address) ?? [];
  const codeLabel = names.codeLabel.get(address);
  const instr = dis.instructions.find((i) => i.address === address);
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">
          {hex4(address)} {names.targetDisplay.get(address) ?? ""}{" "}
          {codeLabel && map && <TrustBadge trust={trustOf(codeLabel.origin, map, codeHash)} />}
        </span>
        <Button size="sm" variant="outline" onClick={() => onNameLocation(address)}>
          {t("inspector.code.nameLocation")}
        </Button>
      </div>
      {instr && <p className="font-mono text-xs text-muted-foreground">{instr.bytes}</p>}
      <div>
        <p>{t("inspector.code.incoming")}:</p>
        {incoming.length === 0 ? (
          <span className="text-muted-foreground">{t("inspector.code.none")}</span>
        ) : (
          <ul>
            {incoming.map((r) => (
              <li key={`${r.from}-${r.kind}`}>
                <button type="button" className="font-mono underline decoration-dotted" onClick={() => onGo(r.from)}>
                  {hex4(r.from)}
                </button>{" "}
                <span className="text-muted-foreground">{jumpKindText(r.kind)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: The Code tab itself**

`src/features/inspector/ui/code-tab.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Contract } from "@signumjs/contracts";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { t } from "@/i18n/runtime";
import { upsertCodeLabel, removeCodeLabel, upsertSlot } from "../model/label-map-edits";
import type { IndexedLabelMap } from "../model/resolve-label-map";
import type { WatchEntry } from "../model/watchlist";
import { slotUse } from "../disasm/xrefs";
import type { Capability } from "../disasm/capabilities";
import { exportAsm } from "../workspace/export-asm";
import { updateFileText } from "../workspace/update-file";
import { CodeDetail, type CodeSelection } from "./code-detail";
import { CodeLabelDialog } from "./code-label-dialog";
import { CodeListing } from "./code-listing";
import { CodeOutline } from "./code-outline";
import { SlotLabelDialog } from "./slot-label-dialog";
import { useDisassembly } from "./use-disassembly";
import { networkLabel } from "./watchlist-panel";

export type CodeFocus = { slot?: number; address?: number; nonce: number };

function capabilityText(c: Capability): string {
  switch (c) {
    case "sendsFunds":
      return t("inspector.code.caps.sendsFunds");
    case "assets":
      return t("inspector.code.caps.assets");
    case "writesMaps":
      return t("inspector.code.caps.writesMaps");
    case "readsMaps":
      return t("inspector.code.caps.readsMaps");
    case "readsBalances":
      return t("inspector.code.caps.readsBalances");
    case "crypto":
      return t("inspector.code.caps.crypto");
  }
}

export function CodeTab({
  contract,
  labelMap,
  entry,
  folderId,
  prefix,
  ensureLabelMap,
  focus,
  onShowSlot,
}: {
  contract: Contract;
  labelMap: IndexedLabelMap | null;
  entry: WatchEntry;
  folderId: string;
  prefix: "S" | "TS";
  ensureLabelMap: () => Promise<string | null>;
  focus: CodeFocus | null;
  onShowSlot: (index: number) => void;
}) {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const map = labelMap?.map ?? null;
  const view = useDisassembly(contract, map, {
    contractId: contract.at,
    contractRS: contract.atRS,
    network: networkLabel(entry.network),
    codeHash: contract.machineCodeHashId,
    creatorRS: contract.creatorRS,
    labelsFile: labelMap?.path ?? null,
  });
  const [selection, setSelection] = useState<CodeSelection | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  const [showBytes, setShowBytes] = useState(false);
  const [showValues, setShowValues] = useState(true);
  const [slotDialog, setSlotDialog] = useState<number | null>(null);
  const [nameDialog, setNameDialog] = useState<number | null>(null);

  const go = (address: number) => {
    if (selection && selection.kind !== "slot") setHistory((h) => [...h, selection.address]);
    setSelection({ kind: "instruction", address });
    setScrollTo(address);
  };

  useEffect(() => {
    if (!focus) return;
    if (focus.slot !== undefined) setSelection({ kind: "slot", index: focus.slot });
    if (focus.address !== undefined) go(focus.address);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  const highlight = useMemo(() => {
    if (!view || selection?.kind !== "slot") return new Set<number>();
    const { reads, writes } = slotUse(view.xrefs, selection.index);
    return new Set([...reads, ...writes]);
  }, [view, selection]);

  if (!contract.machineCode) return <p className="p-4 text-sm">{t("inspector.code.noCode")}</p>;
  if (!view || view.dis.rows.length === 0) return <p className="p-4 text-sm">{t("inspector.code.empty")}</p>;

  const writeLabels = async (edit: (text: string) => string, done: string) => {
    const fileId = labelMap?.fileId ?? (await ensureLabelMap());
    if (!fileId) return;
    try {
      await updateFileText(fs, fileId, edit);
      toast.success(done);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const unknownCount = view.dis.rows.filter((r) => r.kind === "unknown").length + view.dis.misaligned.length;
  const verifyText =
    view.verify === null
      ? t("inspector.code.notAssemblable", { count: unknownCount })
      : view.verify === "pending"
        ? t("inspector.code.verifyPending")
        : view.verify.ok
          ? t("inspector.code.verifyOk")
          : view.verify.reason === "differs"
            ? t("inspector.code.verifyDiffers", { byte: view.verify.byte })
            : t("inspector.code.verifyCompile", { message: view.verify.message });
  const canExport = view.verify !== null && view.verify !== "pending" && view.verify.ok;

  const doExport = async () => {
    try {
      const { fileId, name } = await exportAsm(fs, folderId, entry.alias ?? contract.name, contract.at, view.asm());
      toast.success(t("inspector.code.exported", { name }), {
        action: { label: t("inspector.code.open"), onClick: () => navigate(`/projects/${folderId}/files/${fileId}`) },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const slotLabel = slotDialog !== null ? view.names.slotLabel[slotDialog] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-2 border-b px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t("inspector.code.caps.title")}:</span>
          {view.capabilities.length === 0 ? (
            <span className="text-muted-foreground">{t("inspector.code.caps.nothing")}</span>
          ) : (
            view.capabilities.map((c) => (
              <button
                key={c.capability}
                type="button"
                className="rounded border px-2 py-0.5"
                title={c.apis.join(", ")}
                onClick={() => go(c.sites[0]!)}
              >
                {capabilityText(c.capability)} ({c.sites.length})
              </button>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <span>
            {t("inspector.code.size", {
              bytes: view.dis.codeLength,
              instructions: view.dis.instructions.length,
              pages: Math.ceil(view.dis.codeLength / 256),
            })}
          </span>
          <span className={view.verify !== null && view.verify !== "pending" && view.verify.ok ? "text-[var(--green)]" : ""}>
            {verifyText}
          </span>
          <label className="flex items-center gap-1">
            <Checkbox checked={showBytes} onCheckedChange={(v) => setShowBytes(v === true)} /> {t("inspector.code.showBytes")}
          </label>
          <label className="flex items-center gap-1">
            <Checkbox checked={showValues} onCheckedChange={(v) => setShowValues(v === true)} /> {t("inspector.code.showValues")}
          </label>
          {history.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => {
              const previous = history.at(-1)!;
              setHistory((h) => h.slice(0, -1));
              setSelection({ kind: "instruction", address: previous });
              setScrollTo(previous);
            }}>
              <ArrowLeft className="h-3.5 w-3.5" /> {t("inspector.code.back")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={!canExport}
            title={canExport ? undefined : t("inspector.code.exportDisabled")}
            onClick={() => void doExport()}
          >
            <Download className="h-3.5 w-3.5" /> {t("inspector.code.export")}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <CodeOutline outline={view.outline} names={view.names} onGo={go} />
        <CodeListing
          view={view}
          machineData={contract.machineData}
          prefix={prefix}
          enums={map?.enums ?? {}}
          selection={selection}
          highlight={highlight}
          showBytes={showBytes}
          showValues={showValues}
          scrollTo={scrollTo}
          onSelect={(s) => {
            if (s.kind === "target") go(s.address);
            else setSelection(s);
          }}
        />
        <aside className="w-80 shrink-0 overflow-auto border-l">
          <CodeDetail
            view={view}
            selection={selection}
            map={map}
            codeHash={contract.machineCodeHashId}
            machineData={contract.machineData}
            prefix={prefix}
            onGo={go}
            onLabelSlot={setSlotDialog}
            onNameLocation={setNameDialog}
            onShowInData={onShowSlot}
          />
        </aside>
      </div>
      {slotDialog !== null && (
        <SlotLabelDialog
          open
          onOpenChange={(o) => !o && setSlotDialog(null)}
          initial={slotLabel ?? { index: slotDialog, name: "" }}
          enums={Object.keys(map?.enums ?? {})}
          onSave={(slot) => void writeLabels((text) => upsertSlot(text, slot), t("inspector.data.saved"))}
        />
      )}
      {nameDialog !== null && (
        <CodeLabelDialog
          open
          onOpenChange={(o) => !o && setNameDialog(null)}
          address={nameDialog}
          initial={view.names.codeLabel.get(nameDialog)?.name ?? ""}
          onSave={(name) =>
            void writeLabels((text) => upsertCodeLabel(text, { address: nameDialog, name }), t("inspector.codeLabel.saved"))
          }
          onRemove={
            view.names.codeLabel.has(nameDialog)
              ? () => void writeLabels((text) => removeCodeLabel(text, nameDialog), t("inspector.codeLabel.saved"))
              : undefined
          }
        />
      )}
    </div>
  );
}
```

`sonner@2` supports `action: { label, onClick }` on `toast.success`.

- [ ] **Step 5: Add the tab to `ContractView`**

In `contract-view.tsx`:

- import `CodeTab` and `type CodeFocus` from `./code-tab`
- add `const [codeFocus, setCodeFocus] = useState<CodeFocus | null>(null);` next to `tab` (`setCodeFocus` is first called in Task 11; the value is passed below)
- after the Maps trigger, add `<TabsTrigger value="code">{t("inspector.contract.tabs.code")}</TabsTrigger>`
- after the Maps content, add:

```tsx
          <TabsContent value="code" className="min-h-0 flex-1 overflow-hidden">
            <CodeTab
              contract={contract}
              labelMap={active}
              entry={entry}
              folderId={folderId}
              prefix={prefix}
              ensureLabelMap={ensureLabelMap}
              focus={codeFocus}
              onShowSlot={() => setTab("data")}
            />
          </TabsContent>
```

Task 11 makes `onShowSlot` select the slot in the Data stack.

- [ ] **Step 6: Typecheck, test, look at it**

```bash
bun run i18n:types && bun test src/features/inspector
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep features/inspector || echo clean
```

Expected: tests PASS; `clean`.

Manual check, with the dev server and the M1 test watchlist:

1. Open a testnet contract and go to the Code tab.
2. The header lists capabilities and the size, then shows "Re-assembles to identical code" after a moment.
3. The outline shows Start and Restart.
4. Clicking a jump target scrolls and selects it, and Back returns.
5. Clicking a slot shows its value and its readers and writers, and the listing highlights them.
6. "Name this location" adds the name to the listing and to the `.labels.json`, with the comment in the file preserved.
7. Export creates `<name>-<id>.asm`, and Open shows it in the ASM editor.

- [ ] **Step 7: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): Code tab — outline, labelled listing, cross-references, capabilities, export

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Data stack ↔ Code navigation and trust in the data stack

**Files:**
- Modify: `src/features/inspector/ui/contract-view.tsx`
- Modify: `src/features/inspector/ui/data-stack-tab.tsx`
- Modify: `src/features/inspector/ui/slot-detail.tsx`
- Modify: `src/i18n/locales/en/inspector.json`

**Interfaces:**
- Consumes: `CodeFocus` (Task 10); `decode`, `buildXrefs`, `slotUse` (Tasks 2, 7); `trustOf` (Task 8); `TrustBadge` (Task 10)
- Produces:
  - `DataStackTab` gains the props `focusSlot: { slot: number; nonce: number } | null` and `onShowInCode: (slot: number) => void`
  - `SlotDetail` gains the props `use: { reads: number; writes: number } | null`, `trust: Trust | null` and `onShowInCode: () => void`

- [ ] **Step 1: Strings**

Add to `inspector.json` under `data`:

```json
"use": "Read by {reads} · written by {writes} instructions",
"showInCode": "Show in code"
```

Run `bun run i18n:types`.

- [ ] **Step 2: Slot detail**

In `slot-detail.tsx`:
- extend the props with `use`, `trust` and `onShowInCode` (types as above)
- render `<TrustBadge trust={trust} />` after the name when `trust` is set
- below the comment, when `use` is set, render:

```tsx
      {use && (
        <div className="flex items-center justify-between gap-2">
          <span>{t("inspector.data.use", { reads: use.reads, writes: use.writes })}</span>
          <Button size="sm" variant="ghost" onClick={onShowInCode}>
            {t("inspector.data.showInCode")}
          </Button>
        </div>
      )}
```

- [ ] **Step 3: Data stack tab**

In `data-stack-tab.tsx`:
- accept `focusSlot` and `onShowInCode`
- compute xrefs once per code:

```ts
  const xrefs = useMemo(() => (contract.machineCode ? buildXrefs(decode(contract.machineCode)) : null), [contract.machineCode]);
```

- apply the focus:

```ts
  useEffect(() => {
    if (!focusSlot) return;
    setSelected(focusSlot.slot);
    document.querySelector(`[data-slot="${focusSlot.slot}"]`)?.scrollIntoView({ block: "center" });
  }, [focusSlot?.nonce]);
```

- give each `<tr>` a `data-slot={row.index}` attribute
- show a `TrustBadge` next to a labelled row's name (`trustOf(row.label.origin, labelMap.map, contract.machineCodeHashId)` when `labelMap?.map` is set)
- pass `SlotDetail` these props:
  - `use={xrefs ? (({ reads, writes }) => ({ reads: reads.length, writes: writes.length }))(slotUse(xrefs, current.index)) : null}`
  - `trust={…same trustOf…}`
  - `onShowInCode={() => onShowInCode(current.index)}`

- [ ] **Step 4: Wire both directions in `ContractView`**

- Add `const [dataFocus, setDataFocus] = useState<{ slot: number; nonce: number } | null>(null);` next to `codeFocus`.
- `DataStackTab` gets `focusSlot={dataFocus}` and `onShowInCode={(slot) => { setCodeFocus({ slot, nonce: Date.now() }); setTab("code"); }}`.
- `CodeTab`'s `onShowSlot` becomes `(slot) => { setDataFocus({ slot, nonce: Date.now() }); setTab("data"); }`.

- [ ] **Step 5: Verify**

```bash
bun run i18n:types && bun test src/features/inspector
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep features/inspector || echo clean
```

Manual check:

1. In the Data stack, a slot shows "Read by n · written by m". **Show in code** opens the Code tab with that slot selected and its sites highlighted.
2. In the Code tab, **Show in data stack** on a slot opens the Data stack with that slot selected and scrolled into view.
3. Labels generated from source show the verified badge. Hand-set labels show the claim badge.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): navigate between data stack and code; trust badges on slot labels

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Label Map editor — trust column and D'Or import/export

**Files:**
- Create: `src/features/inspector/ui/dor-import-dialog.tsx`
- Modify: `src/features/inspector/ui/label-map-editor.tsx`
- Modify: `src/i18n/locales/en/inspector.json`

**Interfaces:**
- Consumes: `toDorMap`, `parseDorMap`, `importDorMap` (Task 8); `trustOf` (Task 8); `TrustBadge` (Task 10); `downloadBlob` from `@/lib/download`; `writeThrough` (M1)
- Produces:
  - `<DorImportDialog open onOpenChange onImport={(dor: DorMap) => void} />`

- [ ] **Step 1: Strings**

Add under `labels`:

```json
"dorExport": "Export D'Or MAP",
"dorImport": "Import D'Or MAP…",
"dorTitle": "Import a D'Or MAP or a compiler machine object",
"dorHint": "Paste JSON with \"Memory\" (slot names) and \"Labels\". Names are added as claims; existing labels are kept.",
"dorInvalid": "Not a D'Or MAP: {message}",
"dorImported": { "one": "{count} name imported", "other": "{count} names imported" },
"trust": "Trust"
```

Run `bun run i18n:types`.

- [ ] **Step 2: Import dialog**

`src/features/inspector/ui/dor-import-dialog.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { t } from "@/i18n/runtime";
import { parseDorMap, type DorMap } from "../disasm/dor-map";

export function DorImportDialog({
  open,
  onOpenChange,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (dor: DorMap) => void;
}) {
  const [text, setText] = useState("");
  const [error, setError] = useState("");
  const run = () => {
    const r = parseDorMap(text);
    if (!r.ok) {
      setError(t("inspector.labels.dorInvalid", { message: r.errors[0]!.message }));
      return;
    }
    onImport(r.value);
    setText("");
    setError("");
    onOpenChange(false);
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("inspector.labels.dorTitle")}</DialogTitle>
          <DialogDescription>{t("inspector.labels.dorHint")}</DialogDescription>
        </DialogHeader>
        <Textarea rows={10} className="font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
        {error && <p className="text-sm text-[var(--mag)]">{error}</p>}
        <DialogFooter>
          <Button onClick={run} disabled={!text.trim()}>
            {t("inspector.labels.dorImport")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

- [ ] **Step 3: Editor**

In `label-map-editor.tsx`:

- **Toolbar:** add two `ToolbarButton`s next to "Generate from source…", both disabled when the file does not parse:
  - **Export D'Or MAP**: `downloadBlob(file.metadata.name.replace(/\.labels\.json$/i, "") + ".dor-map.json", new Blob([JSON.stringify(toDorMap(map), null, 2)], { type: "application/json" }))`
  - **Import D'Or MAP…**: opens `DorImportDialog`. Its `onImport` runs:

```ts
            (dor) => {
              let added = 0;
              write((text) => {
                const result = importDorMap(text, dor);
                added = result.added;
                return result.text;
              });
              toast.success(t("inspector.labels.dorImported", { count: added }));
            }
```

- **Slots table and Maps list:** add a **Trust** column. In the editor the "contract" is the map's own build, so use `trustOf(s.origin, map, map.source?.codeHash ?? "")`. A compiler entry then reads as verified for the build it was generated from, and everything hand-written reads as a claim.

`writeThrough` runs `edit` synchronously, so `added` is set before the toast.

- [ ] **Step 4: Verify**

```bash
bun run i18n:types && bun test src/features/inspector
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep features/inspector || echo clean
```

Manual check:

1. Export a D'Or MAP from a labelled map; the JSON has `Memory` and `Labels`.
2. Import a MAP into an empty map; the names appear with the claim badge, and existing names are unchanged.
3. Generated labels show the verified badge.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src
git commit -m "feat(inspector): trust column and D'Or MAP import/export in the Label Map editor

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Translations, final verification, browser pass

**Files:**
- Modify: `src/i18n/locales/{de,es,fr,it,pt-BR,ru,uk,zh-CN}/inspector.json`
- Modify: `src/i18n/GLOSSARY.md`

- [ ] **Step 1: Glossary**

Add to **Never translated**:

- `.asm`
- `D'Or`, `MAP`
- mnemonics (already covered by "opcodes")

Add to **Terms**:

| English | de | pt-BR | fr | es | it | uk | ru | zh-CN |
|---|---|---|---|---|---|---|---|---|
| disassembly | Disassembly | desmontagem | désassemblage | desensamblado | disassemblaggio | дизасемблювання | дизассемблирование | 反汇编 |
| capability | Fähigkeit | capacidade | capacité | capacidad | capacità | можливість | возможность | 能力 |
| claim (unverified name) | Behauptung | alegação | affirmation | afirmación | affermazione | твердження | утверждение | 声明 |

- [ ] **Step 2: Translate**

Add every new English key (`contract.tabs.code`, `code.*`, `codeLabel.*`, `trust.*`, `data.use`, `data.showInCode`, `labels.dor*`, `labels.trust`) to the eight locales. Follow the glossary and the per-locale style rules (address form, button mood, French narrow no-break spaces, zh-CN punctuation). Plurals:

| Locales | Forms |
|---|---|
| ru, uk | `one`, `few`, `many`, `other` |
| zh-CN | `other` |
| all others | `one`, `other` |

Merge with a script; never overwrite the M1 strings.

- [ ] **Step 3: Full verification**

```bash
bun run i18n:types && bun run i18n:scan 2>&1 | grep -E "features/inspector" ; bun run i18n:report
bun test 2>&1 | tail -3
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -c "error TS"
bun run build > /dev/null 2>&1; echo "build $?"
```

Expected:
- the scan has no findings in `features/inspector`
- every locale at 100%
- all tests pass, with the count well above 810
- 31 TS errors
- `build 0`

- [ ] **Step 4: Browser pass**

Run the dev server, then check against the testnet stock contract `12589742833133361726` (same code as `examples/stock.smart.c`):

1. **Code tab:** the capabilities include sending funds; the outline shows Start, Restart and functions; the round trip shows "Re-assembles to identical code".
2. **Generate labels:** in the Label Map editor, generate labels from `examples/stock.smart.c` (import it into a test project first). The function names appear in the outline, and their badges read verified.
3. **Export:** the `.asm` opens in the ASM editor; its header names the contract, the hash and the labels file.
4. **Contrast:** check selection contrast in the listing in Dawn and Terminal (memory: studio-selection-contrast).

Record what was and was not verified in the ledger.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/i18n
git commit -m "i18n(inspector): M2 translations for all locales

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Spec coverage

| Spec section | Task(s) |
|---|---|
| §3 facts (assembler table, round trip, `^comment`/`^declare`, `__fn_` labels) | 1, 3, 5 |
| §5.1 opcode table (deviation 1) | 1 |
| §5.2 decoding, padding, unknown rows, misaligned targets | 2 |
| §5.3 names | 4 |
| §5.4 assembly output, provenance | 5 |
| §5.5 outline | 6 |
| §5.6 xrefs (deviation 2), capabilities | 7 |
| §5.7 `source.codeHash`, code-label edits, generator fix | 3 |
| §5.8 trust levels, plain text | 8, 10, 11, 12 |
| §5.9 Code tab UI, navigation | 10, 11 |
| §5.10 export, no deploy | 9, 10 |
| §5.11 D'Or MAP | 8, 12 |
| §6 guardrails | 5 (header), 7 (capabilities), 8/10–12 (trust, plain text), 10 (no deploy) |
| §7 error handling | 2, 5, 10 |
| §8 testing | 1–9; i18n in 13 |
| §9 out of scope | not planned |
