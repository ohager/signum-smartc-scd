import type * as Monaco from "monaco-editor";
import { SmartCKeywords, SmartCDisabledKeywords } from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";

export function createCompletionProvider(
  monaco: typeof Monaco,
): Monaco.languages.CompletionItemProvider {
  const disabled = new Set(SmartCDisabledKeywords);
  return {
    triggerCharacters: [".", ">"], // '>' fires for '->'
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const items: Monaco.languages.CompletionItem[] = [];

      for (const [kw, info] of Object.entries(SmartCKeywords)) {
        if (disabled.has(kw)) continue;
        items.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          detail: info.detail,
          documentation: info.documentation,
          range,
        });
      }

      for (const [fn, info] of Object.entries(SmartCFunctions)) {
        const args = info.params
          .map((p, i) => `\${${i + 1}:${p.name}}`)
          .join(", ");
        items.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}(${args})`,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: info.detail,
          documentation: { value: info.documentation, isTrusted: true },
          range,
        });
      }

      return { suggestions: items };
    },
  };
}
