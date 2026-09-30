import type { Monaco } from "@monaco-editor/react";
import { format } from "jsonc-parser";
import { labelMapJsonSchema, watchlistJsonSchema } from "../model/schemas";

/**
 * Monaco's JSON diagnostics options are global to the instance, not per
 * model. The scenario editor used to switch validation off for everything to
 * make room for JSON5; it now has its own `json5` language instead, which the
 * JSON worker never sees, so the inspector files can be validated against
 * their schemas.
 */

let registered = false;

export function registerStudioJson(monaco: Monaco): void {
  if (registered) return;
  registered = true;

  monaco.languages.json?.jsonDefaults.setDiagnosticsOptions({
    validate: true,
    allowComments: true,
    comments: "ignore",
    trailingCommas: "ignore",
    enableSchemaRequest: false,
    schemas: [
      {
        uri: "studio://schemas/labels.json", // i18n-ignore
        fileMatch: ["*.labels.json", "**/*.labels.json"], // i18n-ignore
        schema: labelMapJsonSchema(),
      },
      {
        uri: "studio://schemas/inspect.json", // i18n-ignore
        fileMatch: ["*.inspect.json", "**/*.inspect.json"], // i18n-ignore
        schema: watchlistJsonSchema(),
      },
    ],
  } as Parameters<typeof monaco.languages.json.jsonDefaults.setDiagnosticsOptions>[0]);

  monaco.languages.register({ id: "json5" });
  monaco.languages.setMonarchTokensProvider("json5", {
    tokenizer: {
      root: [
        [/\/\/.*$/, "comment"],
        [/\/\*/, "comment", "@comment"],
        [/"(?:[^"\\]|\\.)*"(?=\s*:)/, "type"],
        [/[A-Za-z_$][\w$]*(?=\s*:)/, "type"],
        [/"(?:[^"\\]|\\.)*"/, "string"],
        [/'(?:[^'\\]|\\.)*'/, "string"],
        [/-?(?:0x[0-9a-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/, "number"],
        [/\b(?:true|false|null)\b/, "keyword"],
        [/[{}[\],:]/, "delimiter"],
      ],
      comment: [
        [/\*\//, "comment", "@pop"],
        [/[^*]+/, "comment"],
        [/\*/, "comment"],
      ],
    },
  });
  monaco.languages.setLanguageConfiguration("json5", {
    comments: { lineComment: "//", blockComment: ["/*", "*/"] },
    brackets: [["{", "}"], ["[", "]"]],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
    ],
  });
  monaco.languages.registerDocumentFormattingEditProvider("json5", {
    provideDocumentFormattingEdits(model, options) {
      return format(model.getValue(), undefined, {
        tabSize: options.tabSize,
        insertSpaces: options.insertSpaces,
      }).map((edit) => {
        const start = model.getPositionAt(edit.offset);
        const end = model.getPositionAt(edit.offset + edit.length);
        return {
          range: new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column),
          text: edit.content,
        };
      });
    },
  });
}
