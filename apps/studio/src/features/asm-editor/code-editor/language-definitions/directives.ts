export const AsmDirectives = [
  {
    label: "^declare",
    insertText: "^declare ${1:variableName}",
    detail: "Variable Declaration",
    documentation: "Declare a variable",
  },
  {
    label: "^program",
    insertText: "^program name ${1:programName}",
    detail: "Program Definition",
    documentation: "Set program's name. Only regular letters and numbers allowed, max 30 chars in length. A value is mandatory for deployment",
  },
  {
    label: "^program description",
    insertText: "^program description ${1:description}",
    detail: "Program Description",
    documentation: "Your program description: Set program's description. No new lines and max length is 1000 chars. This is optional.",
  },
  {
    label: "^program activationAmount",
    insertText: "^program activationAmount ${1:amount_nqt}",
    detail: "Program Activation Amount",
    documentation: "Set program's activation amount. The value will be set in NQT (Example: 3400_0000). If an incoming transaction has an amount is less than this value, it will not be processed by program (but the amount will be received!). Set a low value but bigger than worst case amount needed to run in your program. If set too low, your program will be frozen during execution (out of gas). If set too high, program balance will be high after execution (unspent balance). Remember to handle this case if creating serious program! A value is mandatory for deployment.",
  },
  {
    label: "^program userStackPages",
    insertText: "^program userStackPages ${1:pages}",
    detail: "Program User Stack Pages",
    documentation: " User pages are used during function calls to pass arguments values, to store function return value, or to store function scope variables during recursive calls. Default value is zero if not needed, or one if needed. Tweak this value if using more than 16 arguments on functions or recursive functions. Maximum value is 10 pages.",
  },
  {
    label: "^program codeStackPages",
    insertText: "^program codeStackPages ${1:pages}",
    detail: "Program Code Stack Pages",
    documentation: "Code pages are used during function calls, to store the instruction pointer return position (also know as Program Counter). Default value is zero if not needed, or one if needed. Every page allows to store 16 values. Tweak this value if using many nested functions or recursive functions. Maximum value is 10 pages",
  },
  {
    label: "^program codeHashId",
    insertText: "^program codeHashId ${1:id}",
    detail: "Program Code Hash Id",
    documentation: "Ensure the compiled program will have this exact code hash id. Use 0 to make this information available at assembly output (during development). Use the actual number if you plan do distribute the source code, so the compiler will raise an error on divergency. This is optional.",
  },
  {
    label: "^const",
    insertText: "^const ${1:variableName} ${2:value}",
    detail: "Constant Declaration",
    documentation: "Declare a constant",
  },
];

type Range = {
  startLineNumber:number,
  endLineNumber: number,
  startColumn: number,
  endColumn: number
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
