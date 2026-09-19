import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  EditorToolbar,
  EditorDiagnostic,
} from "@/components/ui/editor/editor-toolbar.tsx";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { registerClimateThemes } from "@/theme/monaco-themes";
import { toast } from "sonner";
import type { File } from "@/lib/file-system";
import JSON5 from "json5";
import { validateScenario } from "./scenario-io";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  EditorFileActions,
  registerEditorFileActions,
} from "@/components/ui/editor/file-actions.tsx";
import { useEditorFile } from "@/components/ui/editor/use-editor-file.ts";

function validationErrors(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON5.parse(text);
  } catch (e: any) {
    return ["JSON5: " + e.message];
  }
  const r = validateScenario(parsed);
  return r.valid ? [] : r.errors;
}

export function ScenarioEditor({ file }: { file: File }) {
  const monacoTheme = useMonacoTheme();
  const {
    text: content,
    isDirty,
    onChange: onBufferChange,
    saveNow,
    download,
  } = useEditorFile({ file });
  const [errors, setErrors] = useState<string[]>(() =>
    validationErrors(typeof file.content === "string" ? file.content : ""),
  );
  const isValid = errors.length === 0;
  // Typed off OnMount rather than the `monaco-editor` package: the app resolves
  // two copies of it, and their editor types are not mutually assignable.
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState("calc(100vh)");
  useEffect(() => {
    const calculateEditorHeight = () => {
      if (containerRef.current) {
        const containerTop = containerRef.current.getBoundingClientRect().top;
        const newHeight = `calc(100vh - ${containerTop + 30}px)`;
        setEditorHeight(newHeight);
      }
    };

    calculateEditorHeight();
    window.addEventListener("resize", calculateEditorHeight);

    return () => window.removeEventListener("resize", calculateEditorHeight);
  }, []);

  // Monaco's bundled JSON language service provides the formatter; running its
  // action keeps the button, the context menu and Shift+Alt+F on one code path.
  const formatDocument = useCallback(async () => {
    const action = editorRef.current?.getAction("editor.action.formatDocument");
    if (!action) {
      toast.warning("Formatter is not available yet - try again in a moment");
      return;
    }
    try {
      await action.run();
    } catch (e: any) {
      toast.error("Could not format: " + e.message);
    }
  }, []);

  const onChange = (value: string | undefined) => {
    onBufferChange(value ?? "");
    setErrors(validationErrors(value ?? ""));
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    registerEditorFileActions(editor, monaco, { onDownload: download });
  };

  return (
    <div className="flex flex-col" ref={containerRef}>
      <EditorToolbar
        actions={
          <EditorFileActions
            isDirty={isDirty}
            onSave={saveNow}
            onDownload={download}
            onFormat={formatDocument}
          />
        }
      >
        {!isValid && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <EditorDiagnostic tone="error">
                  {errors.length > 1
                    ? `${errors.length} errors: ${errors[0]}`
                    : errors[0]}
                </EditorDiagnostic>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Invalid scenario</TooltipContent>
          </Tooltip>
        )}
      </EditorToolbar>
      <div className="flex-1 rounded h-full">
        <Editor
          height={editorHeight}
          defaultLanguage="json"
          value={content}
          theme={monacoTheme}
          onChange={onChange}
          beforeMount={(monaco) => {
            registerClimateThemes(monaco);
            monaco.languages.json?.jsonDefaults.setDiagnosticsOptions({
              validate: false,
            });
          }}
          onMount={handleEditorDidMount}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            scrollBeyondLastLine: false,
            automaticLayout: true,
          }}
        />
      </div>
    </div>
  );
}
