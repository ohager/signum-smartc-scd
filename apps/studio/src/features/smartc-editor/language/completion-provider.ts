import type * as Monaco from "monaco-editor";
import { SmartCKeywords, SmartCDisabledKeywords } from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";
import { getSymbols } from "./symbol-cache";

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

      const sym = getSymbols(model);
      for (const v of sym.variables)
        items.push({ label: v.name, kind: monaco.languages.CompletionItemKind.Variable, insertText: v.name, detail: `${v.declaration}${v.isPointer ? " *" : ""} ${v.name}`, range });
      for (const c of sym.constants)
        items.push({ label: c.name, kind: monaco.languages.CompletionItemKind.Constant, insertText: c.name, detail: `const ${c.name}`, range });
      for (const m of sym.macros) {
        const insert = m.params ? `${m.name}(${m.params.map((p, i) => `\${${i + 1}:${p}}`).join(", ")})` : m.name;
        items.push({ label: m.name, kind: monaco.languages.CompletionItemKind.Constant, insertText: insert, insertTextRules: m.params ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet : undefined, detail: `#define ${m.name}`, documentation: m.value, range });
      }
      for (const f of sym.functions) {
        const args = f.params.map((p, i) => `\${${i + 1}:${p.name}}`).join(", ");
        items.push({ label: f.name, kind: monaco.languages.CompletionItemKind.Function, insertText: `${f.name}(${args})`, insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet, detail: `${f.returnType} ${f.name}(...)`, range });
      }
      for (const st of sym.structs)
        items.push({ label: st.name, kind: monaco.languages.CompletionItemKind.Struct, insertText: st.name, detail: `struct ${st.name}`, range });

      const seen = new Set<string>();
      const deduped = items.filter((it) => {
        const key = `${it.kind}:${it.label}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      return { suggestions: deduped };
    },
  };
}
