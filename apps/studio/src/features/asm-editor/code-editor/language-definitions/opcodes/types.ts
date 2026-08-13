/**
 * Documentation for the Signum/CIYAM AT instruction set, as accepted by the
 * SmartC assembler.
 *
 * Sources of truth for the hard numbers:
 * - opcode byte, operand forms and encoded size: `opCodeTable` in
 *   `smartc-signum-compiler` (`src/assembler/assembler.ts`)
 * - step fee and runtime behaviour: `CPU_MICROCODE` in
 *   `smartc-signum-simulator` (`src/cpu.ts`)
 *
 * Only mnemonics the assembler actually accepts are listed here. The generic
 * CIYAM AT documentation mentions others (`DUP`, `SWP`, `MIN`, `MAX`, `LDA`, …)
 * that this toolchain does not implement.
 */
export type AsmOpcodeGroup =
  | "Program flow"
  | "Stack"
  | "Arithmetic"
  | "Memory"
  | "API";

/** One operand form of a mnemonic (`SET` has six of them). */
export type AsmOpcodeForm = {
  /** Assembly syntax, written the way the assembler's regex matches it. */
  syntax: string;
  /** Instruction name in the assembler's opcode table, e.g. `SET_VAL`. */
  name: string;
  /** Machine opcode byte. */
  opCode: number;
  /** Encoded length in bytes, which is what counts against the code pages. */
  size: number;
};

export type AsmOpcodeDeclaration = {
  /** Hover heading, e.g. "Branch if zero". */
  title: string;
  group: AsmOpcodeGroup;
  forms: AsmOpcodeForm[];
  /** Steps charged by the AT machine for one execution. */
  stepFee: number;
  /** Markdown prose: semantics, edge cases, and how SmartC emits it. */
  documentation: string;
};
