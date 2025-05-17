// asm-language-definitions.ts
import { AsmKeywords } from "./keywords.ts";
import type { Monaco } from "@monaco-editor/react";
import {
  createApiFunctionCompletionItems,
  createFunctionCallCompletionItems,
} from "./functions.ts";
import { AsmDirectives, createDirectiveCompletionItems } from "./directives.ts";

export function registerAsmLanguage(monaco: Monaco) {
  // Register a new language
  monaco.languages.register({ id: "asm" });

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
          /(\^const)(\s+)([a-zA-Z_][\w$]*)(\s+)(.*)$/,
          [
            "preprocessor",
            "white",
            "variable.declaration",
            "white",
            "constant",
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

  // Register Themes:
  // Define a theme for the language (light theme)
  monaco.editor.defineTheme("asm-light", {
    base: "vs", // 'vs' is the light base theme
    inherit: true,
    rules: [
      // Control flow instructions (including FIN, BEQ, etc.)
      { token: "keyword.control", foreground: "#0000FF", fontStyle: "bold" },

      // Stack Operations
      { token: "keyword.stack", foreground: "#008800", fontStyle: "bold" },

      // Arithmetic Operations
      { token: "keyword.operator", foreground: "#AA6600", fontStyle: "bold" },

      // API Calls
      { token: "keyword.api", foreground: "#8800BB", fontStyle: "bold" },

      // Memory Operations
      { token: "keyword.memory", foreground: "#006699", fontStyle: "bold" },

      // Directives (like __loop1_continue:)
      { token: "directive", foreground: "#CC9900", fontStyle: "italic" },

      // Preprocessor directives (^program, ^declare, etc.)
      { token: "preprocessor", foreground: "#AA3300", fontStyle: "bold" },
      { token: "preprocessor.param", foreground: "#BB5500" },
      {
        token: "preprocessor.value",
        foreground: "#666666",
        fontStyle: "italic",
      },

      // Comments
      { token: "comment", foreground: "#008800", fontStyle: "italic" },

      // Labels
      { token: "label", foreground: "#BB0000", fontStyle: "bold" },

      // Numbers
      { token: "number", foreground: "#0077AA" },
      { token: "number.hex", foreground: "#0066CC" },

      // API function names
      { token: "api", foreground: "#AA00AA", fontStyle: "bold" },

      // Data Types
      { token: "type", foreground: "#008899" },

      // Variables
      { token: "variable.register", foreground: "#DD6600" }, // @variables
      { token: "variable", foreground: "#0077AA" }, // $variables
      { token: "variable.declaration", foreground: "#9900AA" }, // Declared variables

      // Constants
      { token: "constant", foreground: "#BB00BB" },

      // Regular identifiers
      { token: "identifier", foreground: "#333333" },
    ],
    colors: {
      "editor.foreground": "#000000",
      "editor.background": "#FFFFFF",
      "editor.selectionBackground": "#CCDDFF",
      "editor.lineHighlightBackground": "#F0F0F0",
    },
  });

  // Define a dark theme for the language
  monaco.editor.defineTheme("asm-dark", {
    base: "vs-dark", // 'vs-dark' is the dark base theme
    inherit: true,
    rules: [
      // Control flow instructions
      { token: "keyword.control", foreground: "#569CD6", fontStyle: "bold" },

      // Stack Operations
      { token: "keyword.stack", foreground: "#6AA84F", fontStyle: "bold" },

      // Arithmetic Operations
      { token: "keyword.operator", foreground: "#D7BA7D", fontStyle: "bold" },

      // API Calls
      { token: "keyword.api", foreground: "#C586C0", fontStyle: "bold" },

      // Memory Operations
      { token: "keyword.memory", foreground: "#4EC9B0", fontStyle: "bold" },

      // Directives
      { token: "directive", foreground: "#DCDCAA", fontStyle: "italic" },

      // Preprocessor directives
      { token: "preprocessor", foreground: "#FF8C5A", fontStyle: "bold" },
      { token: "preprocessor.param", foreground: "#FFB07A" },
      {
        token: "preprocessor.value",
        foreground: "#AAAAAA",
        fontStyle: "italic",
      },

      // Comments
      { token: "comment", foreground: "#6A9955", fontStyle: "italic" },

      // Labels
      { token: "label", foreground: "#FF8C8C", fontStyle: "bold" },

      // Numbers
      { token: "number", foreground: "#B5CEA8" },
      { token: "number.hex", foreground: "#9CDCFE" },

      // API function names
      { token: "api", foreground: "#D7BA7D", fontStyle: "bold" },

      // Data Types
      { token: "type", foreground: "#4EC9B0" },

      // Variables
      { token: "variable.register", foreground: "#CE9178" },
      { token: "variable", foreground: "#9CDCFE" },
      { token: "variable.declaration", foreground: "#C586C0" },

      // Constants
      { token: "constant", foreground: "#C586C0" },

      // Regular identifiers
      { token: "identifier", foreground: "#BBBBBB" },
    ],
    colors: {
      "editor.foreground": "#DDDDDD",
      "editor.background": "#1E1E1E",
      "editor.selectionBackground": "#264F78",
      "editor.lineHighlightBackground": "#2D2D2D",
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
