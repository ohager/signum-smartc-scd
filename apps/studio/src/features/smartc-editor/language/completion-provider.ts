import type * as Monaco from "monaco-editor";
import {
  SmartCKeywords,
  SmartCDisabledKeywords,
} from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";
import { SmartCDirectives } from "../language-definitions/directives";
import { getSymbols } from "./symbol-cache";
import {
  matchDirectiveContext,
  type DirectiveContext,
} from "./directive-context";

export function createCompletionProvider(
  monaco: typeof Monaco,
): Monaco.languages.CompletionItemProvider {
  const disabled = new Set(SmartCDisabledKeywords);
  return {
    triggerCharacters: [".", ">", "#", " "], // '>' fires for '->', '#'/' ' for directives
    provideCompletionItems(model, position, context) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      const lineToCursor = model.getValueInRange({
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: 1,
        endColumn: position.column,
      });
      const directive = matchDirectiveContext(lineToCursor);
      if (directive) {
        return {
          suggestions: directiveSuggestions(monaco, directive, position, range),
        };
      }
      // ' ' only triggers directives — elsewhere it must not pop up the whole symbol list.
      if (
        context.triggerKind ===
          monaco.languages.CompletionTriggerKind.TriggerCharacter &&
        context.triggerCharacter === " "
      ) {
        return { suggestions: [] };
      }

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
        items.push({
          label: v.name,
          kind: monaco.languages.CompletionItemKind.Variable,
          insertText: v.name,
          detail: `${v.declaration}${v.isPointer ? " *" : ""} ${v.name}`,
          range,
        });
      for (const c of sym.constants)
        items.push({
          label: c.name,
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: c.name,
          detail: `const ${c.name}`,
          range,
        });
      for (const m of sym.macros) {
        const insert = m.params
          ? `${m.name}(${m.params.map((p, i) => `\${${i + 1}:${p}}`).join(", ")})`
          : m.name;
        items.push({
          label: m.name,
          kind: monaco.languages.CompletionItemKind.Constant,
          insertText: insert,
          insertTextRules: m.params
            ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
            : undefined,
          detail: `#define ${m.name}`,
          documentation: m.value,
          range,
        });
      }
      for (const f of sym.functions) {
        const args = f.params
          .map((p, i) => `\${${i + 1}:${p.name}}`)
          .join(", ");
        items.push({
          label: f.name,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${f.name}(${args})`,
          insertTextRules:
            monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          detail: `${f.returnType} ${f.name}(...)`,
          range,
        });
      }
      for (const st of sym.structs)
        items.push({
          label: st.name,
          kind: monaco.languages.CompletionItemKind.Struct,
          insertText: st.name,
          detail: `struct ${st.name}`,
          range,
        });

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

/** Completions for `#program` / `#pragma` lines: the directive name, then its properties. */
function directiveSuggestions(
  monaco: typeof Monaco,
  directive: DirectiveContext,
  position: Monaco.Position,
  wordRange: Monaco.IRange,
): Monaco.languages.CompletionItem[] {
  if (directive.kind === "value") return [];

  if (directive.kind === "directive") {
    const range = {
      startLineNumber: position.lineNumber,
      endLineNumber: position.lineNumber,
      startColumn: directive.startColumn,
      endColumn: position.column,
    };
    return Object.entries(SmartCDirectives).map(([name, info]) => ({
      label: `#${name}`,
      kind: monaco.languages.CompletionItemKind.Keyword,
      insertText: `#${name} `,
      detail: info.detail,
      documentation: { value: info.documentation },
      range,
      // Chain straight into the property list.
      command: {
        id: "editor.action.triggerSuggest",
        title: "Suggest properties",
      },
    }));
  }

  const properties = SmartCDirectives[directive.directive].properties;
  return Object.entries(properties).map(([name, info], i) => ({
    label: name,
    kind: monaco.languages.CompletionItemKind.Property,
    insertText: info.snippet ? `${name} ${info.snippet}` : name,
    insertTextRules: info.snippet
      ? monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet
      : undefined,
    detail: info.detail,
    documentation: { value: info.documentation },
    // Keep the declared order (most relevant first) instead of alphabetical.
    sortText: String(i).padStart(2, "0"),
    range: wordRange,
  }));
}
