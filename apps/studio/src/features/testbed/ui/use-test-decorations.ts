import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import type { TestRow } from "../test-run-model";

const CLASS_FOR_STATUS: Record<string, string> = {
  pending: "test-glyph-pending",
  running: "test-glyph-running",
  passed: "test-glyph-passed",
  failed: "test-glyph-failed",
  timedout: "test-glyph-failed",
  skipped: "test-glyph-skipped",
  todo: "test-glyph-skipped",
};

/**
 * Marks each `it()` in the gutter with its current status.
 *
 * Rows without a resolved line are skipped rather than guessed at — a marker on
 * the wrong line is worse than no marker.
 */
export function useTestDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  rows: TestRow[],
) {
  useEffect(() => {
    if (!editor) return;

    const decorations = rows
      .filter((row) => row.line !== undefined)
      .map((row) => ({
        range: {
          startLineNumber: row.line!,
          startColumn: 1,
          endLineNumber: row.line!,
          endColumn: 1,
        },
        options: {
          isWholeLine: false,
          glyphMarginClassName: CLASS_FOR_STATUS[row.status] ?? "test-glyph-pending",
          glyphMarginHoverMessage: {
            value: `${row.path.join(" › ")} — ${row.status}${
              row.durationMs !== undefined ? ` (${row.durationMs}ms)` : ""
            }`,
          },
        },
      }));

    const collection = editor.createDecorationsCollection(decorations);
    return () => collection.clear();
  }, [editor, rows]);
}
