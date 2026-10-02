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
