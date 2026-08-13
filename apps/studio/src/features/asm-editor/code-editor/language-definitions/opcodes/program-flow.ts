import type { AsmOpcodeDeclaration } from "./types.ts";

/**
 * Every conditional branch encodes its target as a signed byte, so all of them
 * carry the same range caveat. Kept in one place instead of restated per entry.
 */
const BRANCH_RANGE_NOTE =
  "The target is encoded as a **signed 8-bit offset** relative to the branch itself, so it must sit within -128..+127 bytes. " +
  "You do not have to manage that by hand: when a label is out of range the assembler inverts the condition and inserts a `JMP` " +
  "to the far label, which costs 5 extra bytes and one extra instruction.";

/** Which mnemonic the assembler swaps in when a branch has to be inverted. */
const BRANCH_INVERSE: Record<string, string> = {
  BZR: "BNZ",
  BNZ: "BZR",
  BGT: "BLE",
  BLE: "BGT",
  BGE: "BLT",
  BLT: "BGE",
  BEQ: "BNE",
  BNE: "BEQ",
};

/** `BGT`/`BLT`/`BGE`/`BLE`/`BEQ`/`BNE` differ only in the comparison. */
function comparisonBranch(
  mnemonic: keyof typeof BRANCH_INVERSE,
  title: string,
  operator: string,
  opCode: number,
  extra: string,
): AsmOpcodeDeclaration {
  return {
    title,
    group: "Program flow",
    stepFee: 1,
    forms: [
      {
        syntax: `${mnemonic} $var1 $var2 :label`,
        name: `${mnemonic}_DAT`,
        opCode,
        size: 10,
      },
    ],
    documentation:
      `Branches to \`:label\` when \`$var1 ${operator} $var2\`, otherwise falls through to the next instruction.\n\n` +
      `Both operands are compared as **signed** 64-bit integers, so \`0xffffffffffffffff\` counts as \`-1\`, not as a huge positive number. ` +
      `${extra}\n\n` +
      `${BRANCH_RANGE_NOTE} The inverse used for that rewrite is \`${BRANCH_INVERSE[mnemonic]}\`.\n\n` +
      "Reading an operand that was never written yields 0.",
  };
}

export const AsmProgramFlowOpcodes: Record<string, AsmOpcodeDeclaration> = {
  JMP: {
    title: "Jump",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "JMP :label", name: "JMP_ADR", opCode: 0x1a, size: 5 }],
    documentation:
      "Unconditional jump: sets the instruction pointer to `:label` and carries on from there.\n\n" +
      "Unlike the conditional branches, the target is stored as a **full 4-byte absolute address**, so a `JMP` can reach anywhere " +
      "in the code section — there is no range limit. That is also why the assembler falls back to `JMP` when a branch offset " +
      "overflows.\n\n" +
      "An unknown label is an assembly error (`Unknow jump label`). SmartC emits `JMP` for `goto`, for the back edge of " +
      "`while`/`for` loops, and to skip over the `else` arm of an `if`. The optimizer deletes a `JMP` whose target is the very " +
      "next instruction.",
  },

  JSR: {
    title: "Jump to subroutine",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "JSR :label", name: "JMP_SUB", opCode: 0x12, size: 5 }],
    documentation:
      "Pushes the address of the *following* instruction onto the **code stack**, then jumps to `:label`. A later `RET` pops that " +
      "address to come back.\n\n" +
      "The code stack holds 16 entries per page and is sized by `#pragma codeStackPages` (max 10 pages, so 160 nested calls). " +
      "Pushing past that limit aborts the contract with *Code Stack buffer overflow* — unless an `ERR` handler is installed, in " +
      "which case execution continues there instead.\n\n" +
      "Only the return address travels on the code stack. Arguments, return values and the locals of recursive calls go on the " +
      "separate **user stack** via `PSH`/`POP`, sized by `#pragma userStackPages`. This is how SmartC calls user-defined functions.",
  },

  RET: {
    title: "Return from subroutine",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "RET", name: "RET_SUB", opCode: 0x13, size: 1 }],
    documentation:
      "Pops an address off the **code stack** and jumps to it, returning from the `JSR` that pushed it.\n\n" +
      "Running `RET` on an empty code stack aborts the contract with *Code Stack buffer underflow*, unless an `ERR` handler is " +
      "set — then execution jumps there instead.\n\n" +
      "A one-byte instruction, so it is the cheapest way to leave a subroutine. SmartC closes every user-defined function with " +
      "one; a `return expr;` compiles to `SET @r0 $expr` followed by `RET`, so the result comes back in the `r0` register " +
      "rather than on a stack.",
  },

  BZR: {
    title: "Branch if zero",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "BZR $var :label", name: "BZR_DAT", opCode: 0x1b, size: 6 }],
    documentation:
      "Branches to `:label` when `$var` is zero, otherwise falls through.\n\n" +
      "The test is on the raw 64-bit value, so signedness does not matter here — only the all-zero bit pattern branches. " +
      "Reading a variable that was never written yields 0, which *does* branch.\n\n" +
      `${BRANCH_RANGE_NOTE} The inverse used for that rewrite is \`BNZ\`.\n\n` +
      "At 6 bytes this is the smallest conditional in the instruction set, which is why SmartC prefers `BZR`/`BNZ` over a " +
      "comparison branch against a zero constant whenever it can.",
  },

  BNZ: {
    title: "Branch if not zero",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "BNZ $var :label", name: "BNZ_DAT", opCode: 0x1e, size: 6 }],
    documentation:
      "Branches to `:label` when `$var` is anything other than zero, otherwise falls through.\n\n" +
      "The test is on the raw 64-bit value, so signedness does not matter — any non-zero bit pattern branches. Reading a " +
      "variable that was never written yields 0, which does *not* branch.\n\n" +
      `${BRANCH_RANGE_NOTE} The inverse used for that rewrite is \`BZR\`.\n\n` +
      "Exact counterpart of `BZR`; the optimizer swaps one for the other whenever it inverts a condition.",
  },

  BGT: comparisonBranch(
    "BGT",
    "Branch if greater than",
    ">",
    0x1f,
    "SmartC emits it for `>` on `long` and `fixed` operands.",
  ),
  BLT: comparisonBranch(
    "BLT",
    "Branch if less than",
    "<",
    0x20,
    "SmartC emits it for `<` on `long` and `fixed` operands.",
  ),
  BGE: comparisonBranch(
    "BGE",
    "Branch if greater or equal",
    ">=",
    0x21,
    "SmartC emits it for `>=`, and also as the inverted form of `<` when it is cheaper to fall through on the true case.",
  ),
  BLE: comparisonBranch(
    "BLE",
    "Branch if less or equal",
    "<=",
    0x22,
    "SmartC emits it for `<=`, and also as the inverted form of `>`.",
  ),
  BEQ: comparisonBranch(
    "BEQ",
    "Branch if equal",
    "==",
    0x23,
    "For a comparison against zero prefer `BZR`, which is 4 bytes smaller and needs no second operand.",
  ),
  BNE: comparisonBranch(
    "BNE",
    "Branch if not equal",
    "!=",
    0x24,
    "For a comparison against zero prefer `BNZ`, which is 4 bytes smaller and needs no second operand.",
  ),

  SLP: {
    title: "Sleep",
    group: "Program flow",
    stepFee: 1,
    forms: [
      { syntax: "SLP", name: "SLP_IMD", opCode: 0x2a, size: 1 },
      { syntax: "SLP $var", name: "SLP_DAT", opCode: 0x25, size: 5 },
    ],
    documentation:
      "Suspends the contract and resumes it at the **next instruction** on a later block. State and the instruction pointer are " +
      "preserved, so this is a pause, not a restart.\n\n" +
      "* `SLP` — wake up on the next block.\n" +
      "* `SLP $var` — wake up `$var` blocks from now. The value is read as **signed**, and anything below 1 is clamped to 1, so " +
      "`SLP` with a zero or negative operand behaves like the plain one-block form.\n\n" +
      "The contract ends up *stopped but not finished*: it still holds its balance and will be resumed automatically at the " +
      "target block without needing an incoming transaction. This is what SmartC's `sleep` statement compiles to. Prefer the " +
      "bare `SLP` when one block is enough — it is 4 bytes smaller.",
  },

  FIN: {
    title: "Finish execution",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "FIN", name: "FIN_IMD", opCode: 0x28, size: 1 }],
    documentation:
      "Ends this activation and marks the contract *finished*. The instruction pointer is reset to the **PCS** address (the one " +
      "set by the last `PCS` instruction, or the start of the code if there was none), so the next activation begins there " +
      "rather than where execution stopped.\n\n" +
      "The contract goes frozen and will only run again when a new transaction arrives — or on the next block if the activation " +
      "amount is zero. This is what SmartC's `exit` compiles to, and it is also what a program falls into when it runs off the " +
      "end of its code.\n\n" +
      "Contrast with `STP`, which also stops the contract but resumes at the *next* instruction rather than at PCS.",
  },

  STP: {
    title: "Stop execution",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "STP", name: "STP_IMD", opCode: 0x29, size: 1 }],
    documentation:
      "Ends this activation and marks the contract *stopped, not finished*. The instruction pointer is left on the **next " +
      "instruction**, so the following activation picks up exactly where this one left off.\n\n" +
      "The contract goes frozen and waits for a new transaction — or resumes on the next block if the activation amount is " +
      "zero. This is what SmartC's `halt` compiles to.\n\n" +
      "Contrast with `FIN`, which resets execution to the PCS address instead of continuing.",
  },

  FIZ: {
    title: "Finish if zero",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "FIZ $var", name: "FIZ_DAT", opCode: 0x26, size: 5 }],
    documentation:
      "Conditional `FIN`: when `$var` is zero the contract finishes exactly as `FIN` does — frozen, marked finished, instruction " +
      "pointer reset to the **PCS** address. When `$var` is non-zero this is a no-op and execution continues at the next " +
      "instruction.\n\n" +
      "The test is on the raw 64-bit value; an unwritten variable reads as 0 and therefore finishes.\n\n" +
      "Encodes the common \"bail out unless this succeeded\" shape in 5 bytes, against the 7 that the equivalent " +
      "`BNZ $var :skip` / `FIN` / `skip:` pair would cost.",
  },

  STZ: {
    title: "Stop if zero",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "STZ $var", name: "STZ_DAT", opCode: 0x27, size: 5 }],
    documentation:
      "Conditional `STP`: when `$var` is zero the contract stops as `STP` does — frozen, *not* finished, resuming at the next " +
      "instruction on the following activation. When `$var` is non-zero nothing happens and execution simply continues.\n\n" +
      "Note the asymmetry with `FIZ`: either way the instruction pointer advances past the `STZ`, because stopping here means " +
      "\"continue from the next instruction later\", not \"restart\".\n\n" +
      "The test is on the raw 64-bit value; an unwritten variable reads as 0 and therefore stops.",
  },

  ERR: {
    title: "Set error handler",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "ERR :label", name: "ERR_ADR", opCode: 0x2b, size: 5 }],
    documentation:
      "Installs `:label` as the contract's error handler and continues at the next instruction. It does **not** jump there now.\n\n" +
      "Once set, a runtime fault transfers control to the handler instead of killing the contract. The faults that route through " +
      "it are:\n\n" +
      "* division by zero (`DIV`, `MOD`)\n" +
      "* user stack underflow (`POP` on an empty stack)\n" +
      "* code stack overflow / underflow (`JSR` too deep, `RET` with nothing to return to)\n" +
      "* out-of-gas and other machine exceptions\n\n" +
      "Without a handler any of these marks the contract *dead* — permanently, with its balance stuck. The target address is " +
      "stored as a full 4-byte address, so the handler can live anywhere in the code. SmartC generates this from the " +
      "`registerError()` / error-handler support.",
  },

  PCS: {
    title: "Set program counter start",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "PCS", name: "SET_PCS", opCode: 0x30, size: 1 }],
    documentation:
      "Records the address of the **next** instruction as the contract's restart point, then continues normally.\n\n" +
      "`FIN` and `FIZ` reset the instruction pointer to this address, so everything before the `PCS` runs exactly once — on the " +
      "very first activation — and every later activation starts here.\n\n" +
      "That is precisely how SmartC implements `void main()`: global statements are emitted before the `PCS`, and `main()` " +
      "begins right after it. A program with no `main()` has no `PCS`, so the restart point stays at address 0 and the global " +
      "statements re-run on every activation.",
  },

  NOP: {
    title: "No operation",
    group: "Program flow",
    stepFee: 1,
    forms: [{ syntax: "NOP", name: "NOP", opCode: 0x7f, size: 1 }],
    documentation:
      "Does nothing and moves to the next instruction. Costs one byte and one step.\n\n" +
      "SmartC never emits `NOP` — the optimizer would strip it. It exists for hand-written assembly and for padding when you " +
      "need to keep addresses stable.",
  },
};
