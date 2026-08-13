import { describe, it, expect } from "bun:test";
import { AsmOpcodes } from "./index.ts";
import { AsmKeywords } from "../keywords.ts";

/**
 * The opcode bytes and sizes in this folder are transcribed from the
 * assembler's own table. This test re-extracts that table from the installed
 * compiler and diffs it, so a compiler upgrade that adds, drops or resizes an
 * instruction fails here instead of silently leaving the hover docs wrong.
 */
const ASSEMBLER = require.resolve(
  "smartc-signum-compiler/dist/assembler/assembler.js",
);

type TableEntry = { name: string; opCode: number; size: number };

/** Parses `{ opCode: 0x01, name: 'SET_VAL', size: 13, ... }` lines. */
function parseTable(source: string): TableEntry[] {
  const entry =
    /\{\s*opCode:\s*(0x[0-9a-f]+),\s*name:\s*'([A-Za-z_0-9]+)',\s*size:\s*(\d+)/g;
  const found: TableEntry[] = [];
  for (const m of source.matchAll(entry)) {
    found.push({ name: m[2], opCode: Number(m[1]), size: Number(m[3]) });
  }
  return found;
}

const source = await Bun.file(ASSEMBLER).text();
const table = parseTable(source);

// Pseudo-instructions that produce no machine code; documented as directives.
const DIRECTIVES = new Set([
  "blank",
  "label",
  "comment",
  "declare",
  "const",
  "program",
]);
const realInstructions = table.filter((e) => !DIRECTIVES.has(e.name));

const documentedForms = Object.entries(AsmOpcodes).flatMap(([mnemonic, op]) =>
  op.forms.map((f) => ({ mnemonic, ...f })),
);

describe("opcode documentation vs. the assembler's table", () => {
  it("finds the assembler table", () => {
    expect(realInstructions.length).toBeGreaterThan(40);
  });

  it("documents every instruction the assembler accepts", () => {
    const documented = new Set(documentedForms.map((f) => f.name));
    const missing = realInstructions
      .map((e) => e.name)
      .filter((name) => !documented.has(name));
    expect(missing).toEqual([]);
  });

  it("documents no instruction the assembler does not have", () => {
    const real = new Set(realInstructions.map((e) => e.name));
    const extra = documentedForms
      .map((f) => f.name)
      .filter((name) => !real.has(name));
    expect(extra).toEqual([]);
  });

  it("agrees on every opcode byte and instruction size", () => {
    const byName = new Map(realInstructions.map((e) => [e.name, e]));
    const mismatches = documentedForms
      .map((form) => {
        const actual = byName.get(form.name);
        if (!actual) return null;
        if (actual.opCode === form.opCode && actual.size === form.size) {
          return null;
        }
        return {
          name: form.name,
          documented: { opCode: form.opCode, size: form.size },
          actual: { opCode: actual.opCode, size: actual.size },
        };
      })
      .filter(Boolean);
    expect(mismatches).toEqual([]);
  });

  it("starts every documented form with its own mnemonic", () => {
    const wrong = documentedForms.filter(
      (f) => !f.syntax.startsWith(f.mnemonic),
    );
    expect(wrong.map((f) => `${f.mnemonic}: ${f.syntax}`)).toEqual([]);
  });

  it("keeps every documented mnemonic in the syntax-highlight lists", () => {
    // A mnemonic with hover docs but no token rule would render as a plain
    // identifier — documented but visibly unhighlighted.
    const highlighted = new Set([
      ...AsmKeywords.programFlow,
      ...AsmKeywords.stackOperations,
      ...AsmKeywords.arithmeticOperations,
      ...AsmKeywords.apiCalls,
      ...AsmKeywords.memoryOperations,
    ]);
    const unhighlighted = Object.keys(AsmOpcodes).filter(
      (mnemonic) => !highlighted.has(mnemonic),
    );
    expect(unhighlighted).toEqual([]);
  });

  it("gives every mnemonic a title, a group and prose", () => {
    for (const [mnemonic, op] of Object.entries(AsmOpcodes)) {
      expect(op.title, mnemonic).toBeTruthy();
      expect(op.group, mnemonic).toBeTruthy();
      expect(op.forms.length, mnemonic).toBeGreaterThan(0);
      // "full prose", not a one-liner.
      expect(op.documentation.length, mnemonic).toBeGreaterThan(200);
    }
  });
});
