import type * as Monaco from "monaco-editor";
import { SmartCFunctions } from "../language-definitions/functions";
import { SmartCDisabledKeywords } from "../language-definitions/keywords";

const builtinFunctions = Object.keys(SmartCFunctions);

export const smartcMonarch: Monaco.languages.IMonarchLanguage = {
  defaultToken: "",
  tokenPostfix: ".smartc",
  keywords: [
    "if", "else", "while", "do", "for", "switch", "case", "default",
    "break", "continue", "goto", "return", "sizeof", "const", "struct",
    "asm", "sleep", "exit", "halt",
  ],
  typeKeywords: ["long", "fixed", "void"],
  invalidKeywords: SmartCDisabledKeywords,
  builtinFunctions,
  operators: [
    "=", "+", "-", "*", "/", "%", "&", "|", "^", "~", "!", "<", ">",
    "<=", ">=", "==", "!=", "&&", "||", "<<", ">>", "++", "--",
    "+=", "-=", "*=", "/=", "->", ".",
  ],
  symbols: /[=><!~?:&|+\-*/^%]+/,
  tokenizer: {
    root: [
      [/#\s*(program|pragma|include|define)\b/, "keyword.directive"],
      [
        /[a-zA-Z_]\w*/,
        {
          cases: {
            "@invalidKeywords": "invalid",
            "@typeKeywords": "type",
            "@keywords": "keyword",
            "@builtinFunctions": "predefined",
            "@default": "identifier",
          },
        },
      ],
      { include: "@whitespace" },
      [/\d[\d_]*\.\d[\d_]*/, "number.float"],
      [/0[xX][0-9a-fA-F_]+/, "number.hex"],
      [/\d[\d_]*/, "number"],
      [/[{}()[\]]/, "@brackets"],
      [/@symbols/, { cases: { "@operators": "operator", "@default": "" } }],
      [/"/, { token: "string.quote", next: "@string" }],
      [/'/, { token: "string.quote", next: "@char" }],
      [/;/, "delimiter"],
    ],
    whitespace: [
      [/[ \t\r\n]+/, ""],
      [/\/\*/, "comment", "@comment"],
      [/\/\/.*$/, "comment"],
    ],
    comment: [
      [/[^/*]+/, "comment"],
      [/\*\//, "comment", "@pop"],
      [/[/*]/, "comment"],
    ],
    string: [
      [/[^"\\]+/, "string"],
      [/\\./, "string.escape"],
      [/"/, { token: "string.quote", next: "@pop" }],
    ],
    char: [
      [/[^'\\]+/, "string"],
      [/\\./, "string.escape"],
      [/'/, { token: "string.quote", next: "@pop" }],
    ],
  },
};
