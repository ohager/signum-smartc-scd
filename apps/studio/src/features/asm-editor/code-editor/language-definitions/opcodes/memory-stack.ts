import type { AsmOpcodeDeclaration } from "./types.ts";

export const AsmMemoryOpcodes: Record<string, AsmOpcodeDeclaration> = {
  SET: {
    title: "Set / move data",
    group: "Memory",
    stepFee: 1,
    forms: [
      { syntax: "SET @dest #0000000000000000", name: "SET_VAL", opCode: 0x01, size: 13 },
      { syntax: "SET @dest $var", name: "SET_DAT", opCode: 0x02, size: 9 },
      { syntax: "SET @dest $($ptr)", name: "SET_IND", opCode: 0x0e, size: 9 },
      { syntax: "SET @dest $($ptr + $idx)", name: "SET_IDX", opCode: 0x0f, size: 13 },
      { syntax: "SET @($ptr) $var", name: "IND_DAT", opCode: 0x14, size: 9 },
      { syntax: "SET @($ptr + $idx) $var", name: "IDX_DAT", opCode: 0x15, size: 13 },
    ],
    documentation:
      "The workhorse of the instruction set: assigns a value into a memory cell. Six different opcodes hide behind this one " +
      "mnemonic, and the assembler picks between them purely from the shape of the operands.\n\n" +
      "**Direct**\n\n" +
      "* `SET @dest #hex` — load a 64-bit literal. The literal must be exactly 16 lowercase hex digits. At 13 bytes this is " +
      "the most expensive form, which is why `#pragma maxConstVars` exists: it parks common constants in variables so " +
      "repeated uses cost 9 bytes instead of 13.\n" +
      "* `SET @dest $var` — copy one variable into another.\n\n" +
      "**Reading through a pointer**\n\n" +
      "* `SET @dest $($ptr)` — load from the address held in `$ptr`.\n" +
      "* `SET @dest $($ptr + $idx)` — load from `$ptr + $idx`, the form behind `array[i]` and `struct->member` reads.\n\n" +
      "**Writing through a pointer**\n\n" +
      "* `SET @($ptr) $var` — store `$var` at the address held in `$ptr`.\n" +
      "* `SET @($ptr + $idx) $var` — store at `$ptr + $idx`, the form behind `array[i] = x`.\n\n" +
      "Note the asymmetry in the syntax: `@` marks the cell being written and `$` the value being read, so the indirect " +
      "read and the indirect write differ only by which side carries the parentheses.\n\n" +
      "The addresses in `$ptr`/`$idx` are **cell indices, not byte offsets** — every memory cell is one 64-bit word.\n\n" +
      "The four indirect forms are bounds-checked, and going out of range is **fatal**: an effective address below 0 or above " +
      "`32 × dataPages` kills the contract with *Variable address out of range*, unless an `ERR :label` handler is installed. " +
      "A wild pointer therefore takes the contract down rather than quietly corrupting a neighbouring cell.\n\n" +
      "Reading a variable that was never written yields 0.",
  },

  PSH: {
    title: "Push onto the user stack",
    group: "Stack",
    stepFee: 1,
    forms: [{ syntax: "PSH $var", name: "PSH_DAT", opCode: 0x10, size: 5 }],
    documentation:
      "Pushes a copy of `$var` onto the **user stack**.\n\n" +
      "The user stack is separate from the code stack that `JSR`/`RET` use, and is sized by `#pragma userStackPages` — 16 " +
      "entries per page, up to 10 pages.\n\n" +
      "Worth knowing: SmartC does **not** pass arguments on this stack. A call assigns each argument straight into the " +
      "callee's parameter variable with a `SET`, and the return value comes back in `r0`. What actually gets pushed is:\n\n" +
      "* the caller's in-use registers, saved across the call because the callee may clobber them\n" +
      "* the current scope's variables, when the call is **recursive** — that is the case that makes " +
      "`#pragma userStackPages` matter\n\n" +
      "Reading a variable that was never written pushes 0.",
  },

  POP: {
    title: "Pop from the user stack",
    group: "Stack",
    stepFee: 1,
    forms: [{ syntax: "POP @dest", name: "POP_DAT", opCode: 0x11, size: 5 }],
    documentation:
      "Removes the top value from the **user stack** and stores it in `@dest`.\n\n" +
      "Popping an empty stack is a fault: the contract is marked dead with *User Stack buffer underflow*, unless an " +
      "`ERR :label` handler is installed — then execution continues at the handler. This is the failure you hit when a " +
      "hand-written `asm { }` block pushes and pops unevenly.\n\n" +
      "There is no instruction to read the top of the stack without removing it, and no way to index into it; if you need the " +
      "value twice, pop it into a variable.",
  },
};
