import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import { useTheme } from "next-themes";

const preventDefaultSave = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
  }
};

type Schema = {
  uri: string;
  fileMatch: string[];
  schema: any;
};

interface JsonEditorProps {
  value: string;
  schema: Schema;
  onChange: (value: string | undefined) => void;
  onValidationChange?: (error: string) => void;
  height?: string;
}

const noop = () => {};

export function JsonEditor({
  value,
  onChange,
  schema,
  onValidationChange = noop,
  height = "100vh",
}: JsonEditorProps) {
  const monaco = useMonaco();
  const { theme } = useTheme();
  const mounted = useRef(false);

  useEffect(() => {
    window.addEventListener("keydown", preventDefaultSave);
    return () => {
      window.removeEventListener("keydown", preventDefaultSave);
    };
  }, [])

  useEffect(() => {
    if (monaco && !mounted.current) {
      mounted.current = true;
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [schema],
        enableSchemaRequest: false,
      });

      // Add keyboard shortcut handler for Ctrl+S
      const disposable = monaco.editor.addEditorAction({
        id: "save-content",
        label: "Save Content",
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS], // Ctrl+S or Cmd+S on Mac
        contextMenuGroupId: "navigation",
        contextMenuOrder: 1.5,
        run: () => {
          window.dispatchEvent(new CustomEvent("json-editor:save"));
        },
      });
      return () => {
        disposable.dispose();
      };
    }
  }, [monaco]);

  const handleValidation = useCallback(
    (markers: any[]) => {
      console.log("Validation:", markers);
      const error = markers.length > 0 ? markers[0].message : "";
      onValidationChange(error);
    },
    [onValidationChange],
  );

  return (
    <Editor
      height={height}
      defaultLanguage="json"
      value={value}
      onChange={onChange}
      onValidate={handleValidation}
      theme={theme === "dark" ? "vs-dark" : "light"}
      options={{
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 14,
        lineNumbers: "on",
        renderValidationDecorations: "on",
        formatOnPaste: true,
        formatOnType: true,
        automaticLayout: true,
      }}
    />
  );
}
