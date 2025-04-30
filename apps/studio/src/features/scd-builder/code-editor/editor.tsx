import { useEffect } from "react";
import Editor, { useMonaco } from "@monaco-editor/react";
import scdSchema from "@signum-smartc-scd/core/scd-schema.json";
import { useTheme } from "next-themes";

interface JsonEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  onValidationChange: (isValid: boolean, error?: string) => void;
}

export function JsonEditor({
  value,
  onChange,
  onValidationChange,
}: JsonEditorProps) {
  const monaco = useMonaco();
  const { theme } = useTheme();

  useEffect(() => {
    if (monaco) {
      monaco.languages.json.jsonDefaults.setDiagnosticsOptions({
        validate: true,
        schemas: [
          {
            uri: "https://signum.network/scd/schema.json",
            fileMatch: ["*"],
            schema: scdSchema,
          },
        ],
        enableSchemaRequest: false,
      });
    }
  }, [monaco]);

  const handleValidation = (markers: any[]) => {
    console.log("Markers:", markers);
    const error = markers.length > 0 ? markers[0].message : undefined;
    onValidationChange(markers.length === 0, error);
  };

  return (
    <Editor
      height="80vh"
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
