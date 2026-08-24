import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import { testAtLine, type FoundTest } from "../instrument/find-tests";

/**
 * Reports which test the cursor is sitting in, as it moves.
 *
 * Moving outside every test reports nothing rather than clearing the selection.
 * That is what lets the active test survive scrolling to the imports, or
 * navigating to a helper file — where there are no tests at all, and where the
 * whole point is to see the values one particular test produced.
 */
export function useCursorTest(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  found: FoundTest[],
  onEnterTest: (test: FoundTest) => void,
) {
  useEffect(() => {
    if (!editor || found.length === 0) return;

    const report = (line: number) => {
      const test = testAtLine(found, line);
      if (test) onEnterTest(test);
    };

    // Report once for where the cursor already is, so opening a file with the
    // caret inside a test does not wait for a keystroke.
    const position = editor.getPosition();
    if (position) report(position.lineNumber);

    const moves = editor.onDidChangeCursorPosition((event) => report(event.position.lineNumber));
    return () => moves.dispose();
  }, [editor, found, onEnterTest]);
}
