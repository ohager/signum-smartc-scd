import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import type { TestRow } from "../test-run-model";
import type { FoundTest } from "../instrument/find-tests";

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
 * Marks each `it()` in the gutter with its status, and runs that test when the
 * marker is clicked.
 *
 * Two sources feed this. The statically found tests give every `it()` a marker
 * before anything has run, which is what makes a test runnable from a cold
 * file; a finished run then colours the markers it has results for.
 *
 * `.skip` and `.todo` tests get no play affordance: an explicit annotation in
 * the source should not be overridden by a click that looks like any other.
 */
export function useTestDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  rows: TestRow[],
  found: FoundTest[],
  onRunTest?: (path: string[]) => void,
) {
  useEffect(() => {
    if (!editor || !monaco) return;

    const statusByLine = new Map<number, TestRow>();
    for (const row of rows) {
      if (row.line !== undefined) statusByLine.set(row.line, row);
    }

    /** Name path by line, for the tests a click may start. */
    const runnable = new Map<number, string[]>();
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    const seen = new Set<number>();

    for (const test of found) {
      seen.add(test.line);
      const row = statusByLine.get(test.line);
      const canRun = test.mode !== "skip" && test.mode !== "todo";
      if (canRun) runnable.set(test.line, test.path);

      const statusClass = row
        ? (CLASS_FOR_STATUS[row.status] ?? "test-glyph-pending")
        : "test-glyph-idle";
      const label = test.path.join(" › ");
      const outcome = row
        ? ` — ${row.status}${row.durationMs !== undefined ? ` (${row.durationMs}ms)` : ""}`
        : "";

      decorations.push({
        range: new monaco.Range(test.line, 1, test.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: `${statusClass}${canRun ? " test-glyph-runnable" : ""}`,
          glyphMarginHoverMessage: {
            value: canRun ? `Run ${label}${outcome}` : `${label} — ${test.mode}`,
          },
        },
      });
    }

    // Results for tests the scan could not see — a computed name, say — still
    // deserve a marker, just not a play button.
    for (const row of rows) {
      if (row.line === undefined || seen.has(row.line)) continue;
      decorations.push({
        range: new monaco.Range(row.line, 1, row.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: CLASS_FOR_STATUS[row.status] ?? "test-glyph-pending",
          glyphMarginHoverMessage: {
            value: `${row.path.join(" › ")} — ${row.status}${
              row.durationMs !== undefined ? ` (${row.durationMs}ms)` : ""
            }`,
          },
        },
      });
    }

    const collection = editor.createDecorationsCollection(decorations);

    const clicks = editor.onMouseDown((event) => {
      if (!onRunTest) return;
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const path = event.target.position && runnable.get(event.target.position.lineNumber);
      if (path) onRunTest(path);
    });

    return () => {
      collection.clear();
      clicks.dispose();
    };
  }, [editor, monaco, rows, found, onRunTest]);
}
