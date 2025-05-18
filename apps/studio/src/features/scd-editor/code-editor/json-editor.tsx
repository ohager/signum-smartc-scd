import { useCallback, useEffect, useRef, useState } from "react";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useSafeMonaco } from "@/hooks/use-safe-monaco.ts";

type Schema=  {
  uri: string,
  fileMatch: string[],
  schema: any,
}

interface JsonEditorProps {
  value: string;
  schema: Schema;
  onChange: (value: string | undefined) => void;
  onValidationChange?: (isValid: boolean, error?: string) => void;
  onSave?: (isValid: boolean, error?: string) => void;
  height?: string;
}

const noop = () => {};

const saveEventHandlers = new Set<Function>();

function addSaveEventListener(handler: Function) {
  // @ts-ignore
  document.addEventListener("editor:save", handler);
  saveEventHandlers.add(handler);
}

function removeAllSaveHandlers() {
  saveEventHandlers.forEach((handler) => {
    // @ts-ignore
    document.removeEventListener("editor:save", handler);
  });
  saveEventHandlers.clear();
}

export function JsonEditor({
  value,
  onChange,
  schema,
  onValidationChange = noop,
  onSave = noop,
  height = "100vh",
}: JsonEditorProps) {
  const monaco = useSafeMonaco();
  const [validationError, setValidationError] = useState("");
  const { theme } = useTheme();

  useEffect(() => {
    const isValid = !validationError;
    removeAllSaveHandlers();
    addSaveEventListener(() => {
      onSave(isValid, validationError);
    });
    onValidationChange(isValid, validationError);

    return removeAllSaveHandlers;
  }, [validationError]);

  useEffect(() => {
    if (monaco) {
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
          // Prevent the browser's default save behavior
          window.addEventListener(
            "keydown",
            (e) => {
              if ((e.ctrlKey || e.metaKey) && e.key === "s") {
                e.preventDefault();
              }
            },
            { once: true },
          );
          document.dispatchEvent(new CustomEvent("editor:save"));
        },
      });
      return () => {
        disposable.dispose();
      };
    }
  }, [monaco, schema]);

  const handleValidation = (markers: any[]) => {
    console.log("Validation:", markers);
    const error = markers.length > 0 ? markers[0].message : undefined;
    setValidationError(error ?? "");
  };

  return (
    <Editor
      loading={<>Loading...</>}
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
