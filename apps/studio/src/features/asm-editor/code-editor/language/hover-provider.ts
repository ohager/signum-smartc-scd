import type * as Monaco from "monaco-editor";
import { AsmOpcodes, type AsmOpcodeDeclaration } from "../language-definitions/opcodes/index.ts";
import { AsmFunctions } from "../language-definitions/functions.ts";
import { AsmDirectiveDocs } from "../language-definitions/directives.ts";
import { matchAsmDirectiveTarget } from "./directive-target.ts";

const hex = (value: number, digits: number) =>
  `0x${value.toString(16).padStart(digits, "0")}`;

/** `EXT_FUN_RET_DAT_2` → the call shape it implements, for the API hover. */
const API_FORM: Record<number, string> = {
  0x32: "no arguments, no return value",
  0x33: "one argument",
  0x34: "two arguments",
  0x35: "returns a value",
  0x36: "returns a value, one argument",
  0x37: "returns a value, two arguments",
};

function opcodeHover(mnemonic: string, op: AsmOpcodeDeclaration): string[] {
  const steps = op.stepFee === 1 ? "1 step" : `${op.stepFee} steps`;
  const rows = op.forms
    .map((f) => `| \`${f.syntax}\` | \`${hex(f.opCode, 2)}\` | ${f.size} |`)
    .join("\n");
  return [
    `**${mnemonic}** — ${op.title}\n\n*${op.group} · ${steps}*`,
    op.documentation,
    `| Form | Opcode | Bytes |\n| --- | --- | --- |\n${rows}`,
  ];
}

function apiFunctionHover(name: string): string[] | null {
  const fn = AsmFunctions[name];
  if (!fn) return null;
  const shape = API_FORM[fn.opCode] ?? `opcode ${hex(fn.opCode, 2)}`;
  return [
    `**${name}** — API function\n\n*${shape} · 10 steps*`,
    fn.description ??
      "Built-in blockchain API function, invoked through the `FUN` instruction.",
    `| API code | Instruction | Arguments |\n| --- | --- | --- |\n` +
      `| \`${hex(fn.apiCode, 4)}\` | \`${hex(fn.opCode, 2)}\` | ${fn.params ?? 0} |`,
  ];
}

/**
 * Hover documentation for the `asm` language: opcodes, `^` directives and the
 * built-in API functions. Read-only views (the simulator's ASM pane) get it too,
 * since providers are registered per language rather than per editor.
 */
export function createAsmHoverProvider(): Monaco.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // Directive lines first: on `^program name X` the word `name` is a
      // property, not the opcode-table entry it might collide with elsewhere.
      const line = model.getLineContent(position.lineNumber);
      const target = matchAsmDirectiveTarget(line, word.startColumn);
      if (target) {
        if (target.kind === "directive") {
          const info = AsmDirectiveDocs[target.name];
          if (!info) return null;
          return {
            contents: [
              { value: `**^${target.name}** — ${info.detail}` },
              { value: info.documentation },
            ],
          };
        }
        const directive = AsmDirectiveDocs[target.directive];
        if (!directive) return null;
        const property = directive.properties?.[target.name];
        if (!property) return null;
        return {
          contents: [
            {
              value: `**^${target.directive} ${target.name}** — ${property.detail}`,
            },
            { value: property.documentation },
          ],
        };
      }

      const opcode = AsmOpcodes[word.word];
      if (opcode) {
        return {
          contents: opcodeHover(word.word, opcode).map((value) => ({ value })),
        };
      }

      const api = apiFunctionHover(word.word);
      if (api) return { contents: api.map((value) => ({ value })) };

      return null;
    },
  };
}
