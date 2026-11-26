import type * as Monaco from "monaco-editor";
import { importSuggestions, type ImportSuggestionKind } from "./import-suggestions";

/*
 * `import "…`, `import … from "…` or `export … from "…`, with the cursor still inside the
 * quotes. `export` needs `from`, or `export const s = "./x` would count as an import. A line
 * starting with `} from "…` closes a multi-line import, the usual shape after formatting.
 */
const SPECIFIER = /^\s*(?:import\s*|(?:import|export)\b[^"'`]*?\bfrom\s*|\}\s*from\s*)(["'])([^"']*)$/;

/** The specifier typed so far, when the cursor is inside an import's quotes on this line; otherwise null. */
export function importSpecifierAt(lineUntilCursor: string): string | null {
  return SPECIFIER.exec(lineUntilCursor)?.[2] ?? null;
}

const registered = new WeakSet<object>();

/*
 * Completes relative import paths in test files: folders, `.ts` modules, contracts as
 * `?raw`. Registered once per Monaco instance, like configureTypeScriptForTests; the
 * file list is read on each request so it is never stale.
 */
export function registerImportCompletion(monaco: typeof Monaco, listWorkspacePaths: () => string[]): void {
  if (registered.has(monaco)) return;
  registered.add(monaco);

  const kinds: Record<ImportSuggestionKind, Monaco.languages.CompletionItemKind> = {
    folder: monaco.languages.CompletionItemKind.Folder,
    module: monaco.languages.CompletionItemKind.Module,
    contract: monaco.languages.CompletionItemKind.File,
  };

  monaco.languages.registerCompletionItemProvider("typescript", {
    triggerCharacters: ['"', "'", "/"],
    provideCompletionItems(model, position) {
      const line = model.getLineContent(position.lineNumber).slice(0, position.column - 1);
      const typed = importSpecifierAt(line);
      if (typed === null) return { suggestions: [] };
      // Replace only the segment after the last slash: "../te|" swaps "te", keeps "../".
      const segment = typed.slice(typed.lastIndexOf("/") + 1);
      const range = new monaco.Range(position.lineNumber, position.column - segment.length, position.lineNumber, position.column);
      const suggestions = importSuggestions(model.uri.path, typed, listWorkspacePaths()).map((s, i) => ({
        label: s.label,
        insertText: s.insertText,
        kind: kinds[s.kind],
        range,
        sortText: String(i).padStart(4, "0"),
        // A folder is a step, not a destination: open the next level right away.
        ...(s.kind === "folder" ? { command: { id: "editor.action.triggerSuggest", title: "" } } : {}),
      }));
      return { suggestions };
    },
  });
}
