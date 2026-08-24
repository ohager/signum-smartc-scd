import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import { formatAnnotation } from "../annotation";
import type { FileTrace } from "../runner/trace";

/**
 * Draws each line's captured value as ghost text at the end of that line, and
 * reports clicks on it.
 *
 * Lines with nothing to say are skipped rather than annotated blank — an empty
 * marker beside a line reads as "this ran and produced nothing", which is a
 * different claim from "this was not recorded".
 *
 * There is deliberately no hover message. The annotation is injected text that
 * sits outside its decoration's zero-width range, so Monaco often has nothing
 * to hover-test against; the Value tab replaces it.
 */
export function useValueDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  trace: FileTrace | undefined,
  onInspectLine?: (line: number) => void,
) {
  useEffect(() => {
    if (!editor || !monaco || !trace) return;

    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    const annotated = new Set<number>();

    for (const [rawLine, lineTrace] of Object.entries(trace)) {
      const line = Number(rawLine);
      // A trace outlives edits, so a line it names may no longer exist.
      if (!Number.isInteger(line) || line < 1 || line > lineCount) continue;

      const annotation = formatAnnotation(lineTrace);
      if (!annotation) continue;

      annotated.add(line);
      const column = model.getLineMaxColumn(line);
      decorations.push({
        range: new monaco.Range(line, column, line, column),
        options: {
          // No leading spaces in the content: they would sit inside the styled
          // span and get underlined along with the text. The gap is a margin.
          after: { content: annotation.text, inlineClassName: "test-inline-value" },
          showIfCollapsed: true,
        },
      });
    }

    const collection = editor.createDecorationsCollection(decorations);

    // The annotation renders past the line's last column, so a click on it
    // resolves to a position at or beyond the end of that line. That is enough
    // to tell an annotation click from a click on the code itself.
    const clicks = editor.onMouseDown((event) => {
      if (!onInspectLine) return;
      const position = event.target.position;
      if (!position || !annotated.has(position.lineNumber)) return;
      if (position.column < model.getLineMaxColumn(position.lineNumber)) return;
      onInspectLine(position.lineNumber);
    });

    return () => {
      collection.clear();
      clicks.dispose();
    };
  }, [editor, monaco, trace, onInspectLine]);
}
