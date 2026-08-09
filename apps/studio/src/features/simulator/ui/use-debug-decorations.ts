import { useEffect } from "react";
import type * as Monaco from "monaco-editor";

/** Highlights the current source line and renders breakpoint glyphs in a Monaco editor. */
export function useDebugDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  currentSourceLine: number | null,
  breakpoints: number[],
) {
  useEffect(() => {
    if (!editor || !monaco) return;
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    for (const line of breakpoints) {
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: false, glyphMarginClassName: "debug-breakpoint" },
      });
    }
    if (currentSourceLine && currentSourceLine > 0) {
      decorations.push({
        range: new monaco.Range(currentSourceLine, 1, currentSourceLine, 1),
        options: { isWholeLine: true, className: "debug-current-line", glyphMarginClassName: "debug-current-glyph" },
      });
    }
    const collection = editor.createDecorationsCollection(decorations);
    if (currentSourceLine && currentSourceLine > 0) {
      editor.revealLineInCenterIfOutsideViewport(currentSourceLine);
    }
    return () => collection.clear();
  }, [editor, monaco, currentSourceLine, breakpoints]);
}
