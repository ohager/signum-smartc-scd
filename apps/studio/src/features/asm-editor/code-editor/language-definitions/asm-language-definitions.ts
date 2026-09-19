// asm-language-definitions.ts
import { AsmKeywords } from "./keywords.ts";
import type { Monaco } from "@monaco-editor/react";
import {
  createApiFunctionCompletionItems,
  createFunctionCallCompletionItems,
} from "./functions.ts";
import { AsmDirectives, createDirectiveCompletionItems } from "./directives.ts";
import { createAsmHoverProvider } from "../language/hover-provider.ts";
import { registerClimateThemes } from "@/theme/monaco-themes";

export const ASM_LANGUAGE_ID = "asm";

export function registerAsmLanguage(monaco: Monaco) {
  // Before the guard below: the themes are generated from the climates and
  // must exist even when the language itself was registered by an earlier
  // mount.
  registerClimateThemes(monaco);

  // Monaco is a global singleton - registering twice would duplicate the
  // completion provider (and its suggestions), so bail out if already done.
  if (monaco.languages.getLanguages().some(({ id }) => id === ASM_LANGUAGE_ID)) {
    return;
  }

  // Register a new language
  monaco.languages.register({ id: ASM_LANGUAGE_ID });

  // Register a tokens provider for the language
  monaco.languages.setMonarchTokensProvider("asm", {
    // Set defaultToken to invalid to see what you do not tokenize yet
    defaultToken: "invalid",

    // we include these common regular expressions
    symbols: /[=><!~?:&|+\-*\/^%]+/,

    // The main tokenizer for our languages
    tokenizer: {
      root: [
        // Preprocessor directives (prefixed with ^)
        [
          /(\^program)(\s+)([a-zA-Z_][\w$]*)/,
          ["preprocessor", "white", "preprocessor.param"],
        ],
        [
          /(\^program)(\s+)([a-zA-Z_][\w$]*)(\s+)(.*)$/,
          [
            "preprocessor",
            "white",
            "preprocessor.param",
            "white",
            "preprocessor.value",
          ],
        ],
        [
          /(\^declare)(\s+)([a-zA-Z_][\w$]*)/,
          ["preprocessor", "white", "variable.declaration"],
        ],
        [
          /(\^const)(\s+)(SET)(\s+)(@[a-zA-Z_][\w$]*)(\s+)(#\d*)$/,
          [
            "preprocessor",
            "white",
            "keyword.stack",
            "white",
            "variable.declaration",
            "white",
            "preprocessor.value",
          ],
        ],

        // Standard ASM Directives (prefixed with __)
        [/(__\w+)/, "directive"],
        [/(\_ASM\_\w+\_(BEGIN|END))/, "directive"],

        // Comments
        [/(\/\/.*)/, "comment"],
        [/\/\*/, "comment", "@comment"],

        // Labels (ending with a colon)
        [/([a-zA-Z_$][\w$]*)(:)/, ["label", "delimiter"]],

        // Numbers
        [/\b\d+\b/, "number"],
        [/\b0x[0-9a-fA-F]+\b/, "number.hex"],
        [/#([0-9a-fA-F]+)/, "number.hex"], // Hexadecimal values with # prefix

        // API function names
        [new RegExp(`\\b(${AsmKeywords.apiFunctions.join("|")})\\b`), "api"],

        // Opcodes - Program Flow
        [
          new RegExp(`\\b(${AsmKeywords.programFlow.join("|")})\\b`),
          "keyword.control",
        ],

        // Opcodes - Stack Operations
        [
          new RegExp(`\\b(${AsmKeywords.stackOperations.join("|")})\\b`),
          "keyword.stack",
        ],

        // Opcodes - Arithmetic Operations
        [
          new RegExp(`\\b(${AsmKeywords.arithmeticOperations.join("|")})\\b`),
          "keyword.operator",
        ],

        // Opcodes - API Calls
        [
          new RegExp(`\\b(${AsmKeywords.apiCalls.join("|")})\\b`),
          "keyword.api",
        ],

        // Opcodes - Memory Operations
        [
          new RegExp(`\\b(${AsmKeywords.memoryOperations.join("|")})\\b`),
          "keyword.memory",
        ],

        // Data Types
        [new RegExp(`\\b(${AsmKeywords.dataTypes.join("|")})\\b`), "type"],

        // Registers prefixed with @
        [/(@[a-zA-Z_][\w$]*)/, "variable.register"],

        // Registers prefixed with $
        [/(\$[a-zA-Z_][\w$]*)/, "variable"],

        // Registers
        [/\b([ABT]\d+)\b/, "variable.register"],

        // Identifiers (like function names)
        [/[a-zA-Z_][\w$]*/, "identifier"],

        // Whitespace
        { include: "@whitespace" },

        // Delimiters and operators
        [/[{}()\[\]]/, "@brackets"],
        [/[<>](?!@symbols)/, "@brackets"],
        [/@symbols/, "operator"],

        // Delimiters
        [/[;,.]/, "delimiter"],
      ],

      comment: [
        [/[^\/*]+/, "comment"],
        [/\/\*/, "comment", "@push"],
        [/\*\//, "comment", "@pop"],
        [/[\/*]/, "comment"],
      ],

      whitespace: [[/[ \t\r\n]+/, "white"]],
    },
  });

  monaco.languages.registerHoverProvider(
    ASM_LANGUAGE_ID,
    createAsmHoverProvider(),
  );

  // Register a completion item provider for the language
  monaco.languages.registerCompletionItemProvider("asm", {
    provideCompletionItems: (model: any, position: any) => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // Get the current line content before the cursor
      const lineContent = model.getLineContent(position.lineNumber);
      const beforeCursor = lineContent.substring(0, position.column - 1).trim();


      if (beforeCursor.endsWith("FUN") || beforeCursor.endsWith("API")) {
        return {
          suggestions: createFunctionCallCompletionItems(range, monaco),
        };
      }

      const isCaretContext = beforeCursor.endsWith('^') ||
        (beforeCursor.includes('^') && beforeCursor.substring(beforeCursor.lastIndexOf('^')).match(/^\^[a-z]*$/i));

      // Special handling for caret symbol
      if (isCaretContext) {
        const caretPos = lineContent.lastIndexOf('^', position.column - 1);
        const caretRange = {
          startLineNumber: position.lineNumber,
          endLineNumber: position.lineNumber,
          startColumn: caretPos + 1, // Start after the caret
          endColumn: position.column
        };

        return {
          suggestions: createDirectiveCompletionItems(monaco, caretRange),
        };
      }

      const completions = [

        ...createCompletionItems(AsmDirectives.map(({label}) => label),
          monaco.languages.CompletionItemKind.Snippet,
          range,
          'Directive',
          ),

        // Program Flow Operations
        ...createCompletionItems(
          AsmKeywords.programFlow,
          monaco.languages.CompletionItemKind.Keyword,
          range,
          "Program Flow Operation",
        ),

        // Stack Operations
        ...createCompletionItems(
          AsmKeywords.stackOperations,
          monaco.languages.CompletionItemKind.Keyword,
          range,
          "Stack Operation",
        ),

        // Arithmetic Operations
        ...createCompletionItems(
          AsmKeywords.arithmeticOperations,
          monaco.languages.CompletionItemKind.Operator,
          range,
          "Arithmetic Operation",
        ),

        // API Calls
        ...createCompletionItems(
          AsmKeywords.apiCalls,
          monaco.languages.CompletionItemKind.Function,
          range,
          "API Call",
        ),

        // Memory Operations
        ...createCompletionItems(
          AsmKeywords.memoryOperations,
          monaco.languages.CompletionItemKind.Method,
          range,
          "Memory Operation",
        ),

        // Data Types
        ...createCompletionItems(
          AsmKeywords.dataTypes,
          monaco.languages.CompletionItemKind.TypeParameter,
          range,
          "Data Type",
        ),

        // Directives
        // ...createCompletionItems(AsmKeywords.directives, monaco.languages.CompletionItemKind.Snippet, range, 'Directive'),

        // API function names (keeping the existing ones)
        ...createApiFunctionCompletionItems(range, monaco),
      ];

      return {
        suggestions: completions,
      };
    },
  });

}

// Helper function to create completion items (unchanged)
function createCompletionItems(
  items: string[],
  kind: any,
  range: any,
  detail: string,
) {
  return items.map((item) => ({
    label: item,
    kind: kind,
    insertText: item,
    range: range,
    detail: detail,
    documentation: `${detail}: ${item}`,
  }));
}
