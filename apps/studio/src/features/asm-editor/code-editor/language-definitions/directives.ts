/**
 * Assembler directives (`^...`). The accepted set and the error behaviour come
 * from the assembler itself (`smartc-signum-compiler`, src/assembler/assembler.ts):
 * `^comment` 0xf2, `^declare` 0xf3, `^const` 0xf4, `^program` 0xf5 — all of
 * them zero bytes in the emitted machine code.
 */

export type AsmDirectiveProperty = {
  detail: string;
  documentation: string;
};

export type AsmDirectiveDeclaration = {
  detail: string;
  documentation: string;
  /** `^program` is the only directive that takes a property name. */
  properties?: Record<string, AsmDirectiveProperty>;
};

/** `^program <property> <value>` — contract metadata carried into deployment. */
const ProgramProperties: Record<string, AsmDirectiveProperty> = {
  name: {
    detail: "Program name (mandatory for deployment)",
    documentation:
      "Set program's name. Only regular letters and numbers allowed, max 30 chars in length. A value is mandatory for deployment.",
  },
  description: {
    detail: "Program description (optional)",
    documentation:
      "Set program's description. No new lines and max length is 1000 chars. This is optional.",
  },
  activationAmount: {
    detail: "Minimum amount to activate the contract (mandatory for deployment)",
    documentation:
      "Set program's activation amount, in NQT (example: `3400_0000`).\n\n" +
      "An incoming transaction carrying less than this is still received — the amount lands in the contract's balance — but it does not wake the contract up. " +
      "Set it above the worst-case cost of a run: too low and the contract freezes mid-execution (out of gas), too high and it accumulates unspent balance you then have to handle. " +
      "A value is mandatory for deployment.",
  },
  userStackPages: {
    detail: "Pages for the user stack (max 10)",
    documentation:
      "User pages back the `PSH`/`POP` stack, which holds saved registers across a call and the scope variables of recursive calls. " +
      "Every page holds 16 values; the default is zero if the program needs none, one otherwise, and the maximum is 10 pages. " +
      "Raise it for deeply recursive functions — overflowing the stack kills the contract.",
  },
  codeStackPages: {
    detail: "Pages for the code stack (max 10)",
    documentation:
      "Code pages back the `JSR`/`RET` stack, which stores the return address of each nested call. " +
      "Every page holds 16 values; the default is zero if the program needs none, one otherwise, and the maximum is 10 pages. " +
      "Raise it for deeply nested or recursive functions.",
  },
  codeHashId: {
    detail: "Enforce the compiled code hash id (optional)",
    documentation:
      "Ensure the compiled program will have this exact code hash id. Use `0` to have the value written back into the assembly output during development. " +
      "Use the real number when distributing source, so the compiler raises an error if the produced machine code diverges. This is optional.",
  },
  creator: {
    detail: "Creator ID — SC-Simulator only",
    documentation:
      "Valid only in SC-Simulator: sets the contract's creator ID so several contracts can be simulated as deployed by different users. " +
      "The assembler accepts and ignores it — it has no effect on the generated machine code or on an actual deployment.",
  },
  contract: {
    detail: "Contract ID — SC-Simulator only",
    documentation:
      "Valid only in SC-Simulator: sets the contract ID, so a scenario deploying several contracts can do so in any order. " +
      "The assembler accepts and ignores it — it has no effect on the generated machine code or on an actual deployment.",
  },
};

export const AsmDirectiveDocs: Record<string, AsmDirectiveDeclaration> = {
  program: {
    detail: "Contract metadata",
    documentation:
      "Declares one piece of contract metadata: `^program <property> <value>`.\n\n" +
      "The directive emits no machine code — the values travel alongside the bytecode to the deployment transaction. " +
      "An unknown property is an assembler error, so the set below is exhaustive.",
    properties: ProgramProperties,
  },
  declare: {
    detail: "Variable declaration",
    documentation:
      "`^declare <name>` reserves one 64-bit memory cell and binds `<name>` to its address.\n\n" +
      "Every `@name` / `$name` in the assembly refers to a cell declared this way, and the order of the declarations fixes the addresses. " +
      "The directive itself emits no machine code, but each declared variable adds a cell to the contract's data pages.",
  },
  const: {
    detail: "Constant initialisation",
    documentation:
      "`^const SET @<name> #<16 hex digits>` gives a declared variable its initial value.\n\n" +
      "The value is baked into the contract's initial memory image at assembly time rather than assigned at runtime, so it costs no code bytes and no steps. " +
      "The syntax is rigid: the `SET`, the `@`, and exactly 16 lowercase hex digits after the `#`.",
  },
  comment: {
    detail: "Assembler comment",
    documentation:
      "`^comment <text>` is ignored by the assembler and emits nothing.\n\n" +
      "SmartC uses it to annotate its output — `#pragma verboseAssembly` interleaves the original C source this way, and " +
      "`#pragma verboseScope` adds register-lifetime notes.",
  },
};

/**
 * Completion items, derived from the docs above so the prose lives in one place.
 * `label` doubles as the trigger text, hence the `^program` entry standing in
 * for the `name` property.
 */
const DIRECTIVE_SNIPPETS: {
  label: string;
  insertText: string;
  detail: string;
  directive: string;
  property?: string;
}[] = [
  {
    label: "^declare",
    insertText: "^declare ${1:variableName}",
    detail: "Variable Declaration",
    directive: "declare",
  },
  {
    label: "^program",
    insertText: "^program name ${1:programName}",
    detail: "Program Definition",
    directive: "program",
    property: "name",
  },
  {
    label: "^program description",
    insertText: "^program description ${1:description}",
    detail: "Program Description",
    directive: "program",
    property: "description",
  },
  {
    label: "^program activationAmount",
    insertText: "^program activationAmount ${1:amount_nqt}",
    detail: "Program Activation Amount",
    directive: "program",
    property: "activationAmount",
  },
  {
    label: "^program userStackPages",
    insertText: "^program userStackPages ${1:pages}",
    detail: "Program User Stack Pages",
    directive: "program",
    property: "userStackPages",
  },
  {
    label: "^program codeStackPages",
    insertText: "^program codeStackPages ${1:pages}",
    detail: "Program Code Stack Pages",
    directive: "program",
    property: "codeStackPages",
  },
  {
    label: "^program codeHashId",
    insertText: "^program codeHashId ${1:id}",
    detail: "Program Code Hash Id",
    directive: "program",
    property: "codeHashId",
  },
  {
    label: "^const",
    insertText: "^const SET @${1:variableName} #${2:0000000000000000}",
    detail: "Constant Declaration",
    directive: "const",
  },
];

export const AsmDirectives = DIRECTIVE_SNIPPETS.map(
  ({ label, insertText, detail, directive, property }) => ({
    label,
    insertText,
    detail,
    documentation: property
      ? AsmDirectiveDocs[directive].properties![property].documentation
      : AsmDirectiveDocs[directive].documentation,
  }),
);

type Range = {
  startLineNumber: number;
  endLineNumber: number;
  startColumn: number;
  endColumn: number;
};

type Args = {
  label: string;
  insertText: string;
  detail: string;
  documentation: string;
  monaco: any;
  range: Range;
};

function createSuggestionItem({ range, monaco, ...rest }: Args) {
  return {
    kind: monaco.languages.CompletionItemKind.Snippet,
    insertTextRules:
      monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
    range,
    ...rest,
  };
}

export function createDirectiveCompletionItems(monaco: any, range: Range) {
  return AsmDirectives.map((suggestion) =>
    createSuggestionItem({
      monaco,
      range,
      ...suggestion,
    }),
  );
}
