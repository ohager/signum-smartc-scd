import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";

/**
 * Read-only view of the generated assembly with the current instruction
 * (0-based `currentAsmLine`) highlighted. Height defaults to filling its parent.
 */
export function AsmView({
  assembly,
  currentAsmLine,
  height = "100%",
}: {
  assembly: string;
  currentAsmLine: number;
  height?: string;
}) {
  const { theme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decoRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const [ready, setReady] = useState(false);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setReady(true);
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const line = currentAsmLine + 1; // 0-based → 1-based
    decoRef.current?.clear();
    decoRef.current = editor.createDecorationsCollection([
      {
        range: new monaco.Range(line, 1, line, 1),
        options: {
          isWholeLine: true,
          className: "debug-current-line",
          glyphMarginClassName: "debug-current-glyph",
        },
      },
    ]);
    editor.revealLineInCenterIfOutsideViewport(line);
  }, [currentAsmLine, ready]);

  return (
    <Editor
      height={height}
      defaultLanguage="plaintext"
      value={assembly}
      theme={theme === "dark" ? "vs-dark" : "light"}
      options={{
        readOnly: true,
        minimap: { enabled: false },
        fontSize: 13,
        lineNumbers: "on",
        glyphMargin: true,
        automaticLayout: true,
        scrollBeyondLastLine: false,
      }}
      onMount={onMount}
    />
  );
}
