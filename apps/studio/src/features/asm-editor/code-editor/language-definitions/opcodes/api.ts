import type { AsmOpcodeDeclaration } from "./types.ts";

export const AsmApiOpcodes: Record<string, AsmOpcodeDeclaration> = {
  FUN: {
    title: "Call an API function",
    group: "API",
    stepFee: 10,
    forms: [
      { syntax: "FUN name", name: "EXT_FUN", opCode: 0x32, size: 3 },
      { syntax: "FUN name $var1", name: "EXT_FUN_DAT", opCode: 0x33, size: 7 },
      { syntax: "FUN name $var1 $var2", name: "EXT_FUN_DAT_2", opCode: 0x34, size: 11 },
      { syntax: "FUN @dest name", name: "EXT_FUN_RET", opCode: 0x35, size: 7 },
      { syntax: "FUN @dest name $var1", name: "EXT_FUN_RET_DAT", opCode: 0x36, size: 11 },
      { syntax: "FUN @dest name $var1 $var2", name: "EXT_FUN_RET_DAT_2", opCode: 0x37, size: 15 },
    ],
    documentation:
      "Calls one of the blockchain's built-in API functions — the machine's only way to reach outside its own memory, for " +
      "reading transactions, sending Signa, hashing, working with assets and maps, and so on.\n\n" +
      "Six opcodes share the mnemonic, chosen by whether the call returns a value and how many arguments it takes. The " +
      "return slot comes **first** in the syntax, before the function name:\n\n" +
      "* `FUN name` / `FUN name $a` / `FUN name $a $b` — no return value\n" +
      "* `FUN @dest name` / `FUN @dest name $a` / `FUN @dest name $a $b` — result written to `@dest`\n\n" +
      "Two arguments is the hard ceiling. Anything that needs more data passes it through the **A and B registers** — four " +
      "64-bit words each — which is why so much AT code is a run of `set_A1`/`set_B2` calls followed by the real one. " +
      "Calling a function with the wrong form, or with a name the machine does not know, kills the contract.\n\n" +
      "**This is the expensive instruction.** Every `FUN` costs **10 steps** against the 1 that every other instruction " +
      "costs, so API calls dominate the gas bill of a typical contract. Hoisting a repeated `FUN` out of a loop is usually " +
      "the single biggest win available, and it is exactly what `#pragma optimizationLevel 3` goes looking for.\n\n" +
      "The name is resolved to a 2-byte API code at assembly time; hover an API function name to see its code.",
  },
};
