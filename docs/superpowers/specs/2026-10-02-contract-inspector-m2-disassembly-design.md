# Contract Inspector M2: Disassembly with Labels — Design

**Date:** 2026-10-02
**Status:** Approved (design), pending implementation plan
**Context:** Milestone 2 of the Contract Inspector
(`docs/superpowers/specs/2026-09-30-contract-inspector-design.md`, §10). M1
(watchlist, labelled data stack and maps, Label Maps) has shipped in 0.3.0-alpha.1.

---

## 1. Problem

M1 names a contract's memory. Its **code** is still a hex string. To work out
what slot 7 means in a contract without source, the user has to see which
instructions read and write it, and when they run. To judge a contract they did
not write, they need to know what it can do, for example whether it can send
funds.

Prior art: **Signum D'Or** (deleterium, GPL-3.0) disassembles AT bytecode into
SmartC-assemblable text and takes a hand-edited "MAP" of names. That is the
compiler's own `{ Memory, Labels }` object. It has no types, no cross-references,
no structure, and no tooling for editing the map. The Studio is Apache-2.0, so
**no D'Or code is reused**; only the idea and the output format are.

## 2. Goal

Primary use case: **understanding** a deployed contract, especially without its
source. Secondary: **continuing to work with it** by exporting the code as `.asm`.

A **Code** tab in the contract view shows:

- a readable, labelled disassembly that re-assembles to byte-identical code
- an outline of entry points and functions
- cross-references between slots and instructions, and between jump targets and
  their sources
- a capability summary taken from the API calls
- trust levels for every name shown

The inspector stays **read-only towards the chain**.

## 3. Facts this design relies on (verified against the installed packages)

- **The assembler table** of `smartc-signum-compiler@2.3.0`
  (`dist/assembler/assembler.js`) gives, per form: `opCode`, `size`, and
  `argsType`, built from these operand types:

  | Type | Meaning | Size |
  |---|---|---|
  | `I` | memory address | 4 bytes LE |
  | `L` | constant | 8 bytes LE |
  | `J` | absolute code address | 4 bytes LE |
  | `B` | branch offset, relative to the instruction's own address | 1 byte, signed |
  | `F` | API function code | 2 bytes LE |

- **The asm-editor opcode definitions** (`features/asm-editor/code-editor/language-definitions/opcodes/*.ts`)
  already carry `opCode`, `size` and `syntax` per form. `opcodes.test.ts` diffs
  them against the installed assembler. API codes live in `functions.ts`.
- **SmartC assembles assembly text** (`new SmartC({ language: "Assembly", sourceCode })`).
  Compiling a contract's own `AssemblyCode` reproduces byte-identical `ByteCode`
  and the same `MachineCodeHashId`.
- **Assembly syntax:**
  - `^comment <text>` is a comment
  - `^declare <name>` declares a slot; declaration order assigns slot addresses
    0, 1, 2, …
  - labels are `\w+:`
  - operand names must match `\w+`
- **The compiler's `Labels`** include function labels such as
  `{ label: "__fn_helper", address: 56 }`. M1's label generator dropped every
  `__`-prefixed label, which is why it reported 0 code labels. That is fixed here
  (§5.7).
- **The SC-Simulator** runs assembly text, not bytecode. Assemblable output is
  therefore the bridge to simulating deployed code later.

## 4. Architecture

Pure logic lives under `apps/studio/src/features/inspector/disasm/`. The UI goes
in `features/inspector/ui/` next to the M1 tabs.

| Module | Responsibility |
|---|---|
| `opcode-index.ts` | opcode byte → form (`argsType`, mnemonic, syntax, size); API code → name |
| `decode.ts` | machine code → instruction list |
| `names.ts` | display names and asm names for slots and code addresses |
| `outline.ts` | entry points, sections, basic-block boundaries |
| `xrefs.ts` | slot reads and writes, incoming jumps, API usage |
| `capabilities.ts` | capability summary from API usage |
| `to-asm.ts` | assemblable SmartC text with a provenance header |
| `verify.ts` | re-assembles with SmartC and compares bytes |
| `trust.ts` | trust level of a label for a given contract |
| `dor-map.ts` | D'Or MAP / compiler-object import and export |

## 5. Design

### 5.1 Opcode table

- Each form in the asm-editor opcode definitions gains
  `argsType: ("I" | "L" | "B" | "J" | "F")[]`.
- `opcodes.test.ts` also diffs `argsType` against the assembler table.
- `opcode-index.ts` builds its lookups from those definitions and from
  `functions.ts`. There is no second table.
- `functions.ts` is checked against the assembler's API table in the same test,
  if it is not checked already.

### 5.2 Decoding

The decoder sweeps linearly from address 0. Each `Instruction` holds:

- `address`
- `bytes`
- `form`
- `operands: Operand[]`, where `Operand` is one of:
  - `{ kind: "slot"; index }`
  - `{ kind: "const"; value: bigint }`
  - `{ kind: "target"; address; relative: boolean }` — `B` resolves to
    `address + signed offset`
  - `{ kind: "api"; code; name }`

Robustness:

- Trailing `00` bytes are page padding and become one `padding` row.
- An unknown opcode byte, an unknown API code, or an instruction running past the
  end of the code becomes an `unknown` row. Decoding resumes at the next byte.
- A target that does not land on an instruction start is flagged
  `misalignedTarget`.
- Decoding never throws.
- A listing that contains `unknown` rows or misaligned targets is **not
  assemblable**, and the result says so.

### 5.3 Names

Display names and asm names are kept separate.

**Slots:**

- *Labelled:* the display name is the Label Map name. The asm name is that name
  sanitized: every character outside `[A-Za-z0-9_]` becomes `_`, a leading digit
  gets a `_` prefix, and collisions get `_2`, `_3`, ….
- *Array items* are named `name_0`, `name_1`, … (SmartC's convention).
- *Unlabelled:* `var_007`, zero-padded to the slot count's width.

**Code addresses:**

- the Label Map's `codeLabels` name, if there is one
- compiler labels: `__fn_helper` is displayed as **helper** and kept as
  `__fn_helper` in asm
- unnamed targets: `lab_01a4` (hex address)

### 5.4 Assembly output

The output is assemblable SmartC text:

```
^comment Disassembled from contract <id> (<RS>) on <network>
^comment Code hash <hash> · creator <RS> · <ISO date>
^comment Labels: <labels file or "none"> (manual and imported names are claims, not verified)
^declare <asm name of slot 0>
…                                   ← every slot from 0 to the highest one used
                                      or present in machineData, without gaps
<label>:
<instruction>
```

- Constants stay `#` plus 16 hex digits. Formatted values are UI only.
- Names and comments from Label Maps enter the export only as sanitized asm names,
  or as one-line plain text in `^comment` with newlines removed.

### 5.5 Outline

**Entry points:**

- **Start:** address 0
- **Restart:** the instruction after each `PCS`
- **Error handler:** each `ERR` target
- **Functions:** each `JSR` target, with its caller count

**Sections:** entry points sorted by address; each section runs to the next
entry point. SmartC lays functions out contiguously, so sections match C
functions. For irregular code they are an approximation; no reachability analysis
is done.

**Basic-block boundaries:** before every target, and after every jump, branch,
`RET`, `FIN` and `STP`.

**Section names:** the code label if there is one; otherwise Start, Restart,
Error handler, or `fn_<hex>`.

### 5.6 Cross-references and capabilities

**Slot access** is derived from each form's syntax, with no hand-kept table:

- `@x` is a write and `$x` is a read.
- In `@($p)` and `@($p + $i)`, the pointers are reads and the write is
  **indirect**. It is reported as "writes through `$p`" and not attributed to a
  slot.
- `INC`, `DEC` and `NOT` read and write their operand. `FUN @dest …` writes
  `dest`.

**Code addresses:** incoming `JMP`, branches and `JSR`, each with its source.

**API usage:** the call sites per function.

**Capabilities**, each linking to its call sites:

| Capability | API calls |
|---|---|
| Sends SIGNA | `send_*` |
| Issues, mints or distributes assets | `Issue_Asset`, `Mint_Asset`, `Distribute_To_Asset_Holders` |
| Writes maps | `Set_Map_Value_Keys_In_A` |
| Reads maps or other accounts' balances | `Get_Map_Value_Keys_In_A`, `Get_Account_Balance`. Whose map is read sits in the A registers at run time and is not decided statically |
| Verifies hashes or signatures | the hash and `Check_Sig` calls |

Capabilities come from the bytecode alone. They never depend on labels.

### 5.7 Label Map changes

- New optional field `source.codeHash`: the hash produced when the labels were
  generated from source. `mergeGenerated` sets it.
- New edits `upsertCodeLabel(text, label)` and `removeCodeLabel(text, address)`.
  They are comment-preserving, as in M1.
- **M1 fix:** the label generator keeps `__fn_*` labels as function labels and
  the other `__`-labels as internal labels.

### 5.8 Trust levels (`trust.ts`)

| Level | Condition |
|---|---|
| **verified** | origin `compiler` and `source.codeHash` equals this contract's hash |
| **compiler, other build** | origin `compiler`, different hash (e.g. other `#define`s) |
| **claim** | origin `manual` or `imported` |

- Each level is shown as an icon with a tooltip in the Code tab, the data stack
  and the Label Map editor.
- **Every name and comment from a Label Map is rendered as plain text**, never as
  Markdown or HTML.

### 5.9 UI: the Code tab

- **Header:**
  - capability summary
  - code size (bytes, instructions, code pages)
  - round-trip status ("✓ re-assembles to identical code" / "⚠ not assemblable:
    …" / "⚠ differs from byte n")
  - **Export as .asm**
- **Left:** the outline. Clicking an entry scrolls to it.
- **Centre:** the listing, a custom React list rather than Monaco.
  - columns: address, bytes (collapsible), mnemonic, operands
  - labels as their own rows; basic-block separators
  - slot operands show their name, and on demand the current value from
    `machineData`
  - hovering a mnemonic shows its title and step fee from the opcode docs
- **Right:** a detail panel for the selected instruction, slot or target, with
  its cross-references and **Set label** (slots reuse M1's dialog; code addresses
  get a "Name this location" dialog).
- **Navigation:**
  - a jump target jumps, with a back history
  - a slot operand selects the slot, with a link to it in the Data stack tab
  - the Data stack slot detail gains "read by n · written by m", which opens the
    Code tab with those sites highlighted

### 5.10 Export

- Writes `<alias or name>-<id>.asm` into the watchlist's folder as
  `FileTypes.ASM`, with the provenance header. A toast offers to open it.
- Disabled, with the reason shown, when the listing is not assemblable or the
  round trip fails.
- **There is no deploy action in the inspector.** A deploy goes through the
  normal ASM/deploy flow, with wallet confirmation.

### 5.11 D'Or compatibility

The Label Map editor gains:

- **Export as D'Or MAP:** `{ Memory: asmNames[], Labels: [{ label, address }] }`
- **Import D'Or MAP / compiler object:** entries arrive with `origin: imported`

## 6. Guardrails (misuse)

Everything decoded here is already public on chain, and the Studio is open
source. Prohibitions would be symbolic. The design relies on transparency:

- a provenance header in every export (§5.4)
- trust levels on every label, with manual and imported names marked as claims
  (§5.8)
- plain-text rendering of all Label Map content (§5.8)
- no shortcut from disassembly to deploy (§5.10)
- a capability summary from bytecode, not labels (§5.6)
- clone detection ("this code hash is also used by contracts of N other
  creators") is planned for M3

## 7. Error handling

| Situation | Behaviour |
|---|---|
| Node response has no `machineCode` | "This node does not return code", plus the M1 "Choose other node" |
| Empty code | "No code" |
| Unknown byte, API code, or misaligned target | marked rows; listing not assemblable; never an exception |
| Round trip differs | first differing byte shown; export disabled |
| Label Map invalid | listing falls back to generated names (as in M1) |

## 8. Testing (bun test)

- **Decode:**
  - every form
  - branch offsets in both directions
  - padding
  - an unknown byte, an unknown API code, a truncated last instruction
- **Round-trip oracle:** every `.smart.c` in the repo (`examples/`, the testbed
  fixtures, the inspector fixtures) is compiled, disassembled and re-assembled.
  The result must be byte-identical, both without a Label Map and with one
  generated from the source.
- **Fuzz:** 1,000 seeded random byte strings. `decode` never throws, and every
  result that claims to be assemblable must re-assemble identically.
- **Names:** sanitizing, collisions, arrays, `__fn_`.
- **Xrefs:** read/write classification per form against an expected table;
  indirect writes.
- **Outline:** a fixture with `PCS`, `JSR` and `ERR`.
- **Capabilities:** a fixture that sends SIGNA and writes maps.
- **Trust levels**, **D'Or import/export round trip**, and the **label-generator
  fix** (`__fn_*` present).
- **i18n:** all locales.

## 9. Out of scope for M2

- control-flow graph view
- clone detection (M3)
- decompiling to C-like pseudo-code
- optimizer
- editing code in the inspector
- simulating exported code from the inspector (the exported `.asm` can be opened
  in the existing tools)
