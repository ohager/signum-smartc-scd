import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import { formatAnnotation } from "../annotation";
import type { FileTrace } from "../runner/trace";

/**
 * Draws each line's captured value as ghost text at the end of that line.
 *
 * Lines with nothing to say are skipped rather than annotated blank — an empty
 * marker beside a line reads as "this ran and produced nothing", which is a
 * different claim from "this was not recorded".
 */
export function useValueDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  trace: FileTrace | undefined,
) {
  useEffect(() => {
    if (!editor || !monaco || !trace) return;

    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    for (const [rawLine, lineTrace] of Object.entries(trace)) {
      const line = Number(rawLine);
      // A trace outlives edits, so a line it names may no longer exist.
      if (!Number.isInteger(line) || line < 1 || line > lineCount) continue;

      const annotation = formatAnnotation(lineTrace);
      if (!annotation) continue;

      const column = model.getLineMaxColumn(line);
      decorations.push({
        range: new monaco.Range(line, column, line, column),
        options: {
          after: { content: `    ${annotation.text}`, inlineClassName: "test-inline-value" },
          hoverMessage: annotation.hover ? { value: annotation.hover } : undefined,
          showIfCollapsed: true,
        },
      });
    }

    const collection = editor.createDecorationsCollection(decorations);
    return () => collection.clear();
  }, [editor, monaco, trace]);
}
