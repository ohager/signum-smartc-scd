import { useEffect } from "react";
import type * as Monaco from "monaco-editor";

/** Highlights the current source line in a Monaco editor. */
export function useDebugDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  currentSourceLine: number | null,
) {
  useEffect(() => {
    if (!editor || !monaco) return;
    const collection = editor.createDecorationsCollection(
      currentSourceLine && currentSourceLine > 0
        ? [
            {
              range: new monaco.Range(currentSourceLine, 1, currentSourceLine, 1),
              options: {
                isWholeLine: true,
                className: "debug-current-line",
                glyphMarginClassName: "debug-current-glyph",
              },
            },
          ]
        : [],
    );
    if (currentSourceLine && currentSourceLine > 0) {
      editor.revealLineInCenterIfOutsideViewport(currentSourceLine);
    }
    return () => collection.clear();
  }, [editor, monaco, currentSourceLine]);
}
