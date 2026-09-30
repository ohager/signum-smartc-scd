import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { StepForward } from "lucide-react";
import {
  SurfaceToolbar,
  ToolbarButton,
  ToolbarDiagnostic,
} from "@/components/ui/surface-toolbar.tsx";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { findProjectOfFolder } from "@/features/project/project-root";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { registerClimateThemes } from "@/theme/monaco-themes";
import { toast } from "sonner";
import type { File } from "@/lib/file-system";
import JSON5 from "json5";
import { validateScenario } from "./scenario-io";
import {
  EditorFileActions,
  registerEditorFileActions,
} from "@/components/ui/editor/file-actions.tsx";
import { useEditorFile } from "@/components/ui/editor/use-editor-file.ts";
import { t } from "@/i18n/runtime";

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
  const monacoTheme = useMonacoTheme("json");
  const {
    text: content,
    isDirty,
    onChange: onBufferChange,
    save,
    saveNow,
    download,
  } = useEditorFile({ file });
  const navigate = useNavigate();
  const fs = useFileSystem();
  const projectId = findProjectOfFolder(fs, file.metadata.folderId);

  /**
   * Saves before it leaves. The simulator reads scenarios from the file system
   * rather than from this buffer, so an unsaved edit would be stepped in its
   * previous version — the tool would be lying about what it is running.
   * Quietly: the user asked to simulate, not to save.
   */
  const simulate = useCallback(async () => {
    if (!projectId) return;
    await save({ silent: true });
    navigate(
      `/projects/${projectId}/simulate?scenario=${encodeURIComponent(file.metadata.name)}`,
    );
  }, [save, navigate, projectId, file.metadata.name]);
  const [errors, setErrors] = useState<string[]>(() =>
    validationErrors(typeof file.content === "string" ? file.content : ""),
  );
  const isValid = errors.length === 0;
  // Typed off OnMount rather than the `monaco-editor` package: the app resolves
  // two copies of it, and their editor types are not mutually assignable.
  const editorRef = useRef<Parameters<OnMount>[0] | null>(null);

  // Monaco's bundled JSON language service provides the formatter; running its
  // action keeps the button, the context menu and Shift+Alt+F on one code path.
  const formatDocument = useCallback(async () => {
    const action = editorRef.current?.getAction("editor.action.formatDocument");
    if (!action) {
      toast.warning(t("simulator.scenario.formatterUnavailable"));
      return;
    }
    try {
      await action.run();
    } catch (e: any) {
      toast.error(t("simulator.scenario.formatFailed", { message: e.message }));
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
    <div className="flex min-h-0 flex-1 flex-col">
      <SurfaceToolbar
        verbs={
          <ToolbarButton
            weight="primary"
            onClick={() => {
              simulate().catch((e) =>
                toast.error(t("simulator.scenario.simulateFailed", { message: (e as Error).message })),
              );
            }}
            disabled={!isValid || !projectId}
            title={
              isValid
                ? t("simulator.scenario.simulateHint")
                : t("simulator.scenario.fixFirst")
            }
          >
            <StepForward className="h-4 w-4" />
            {t("simulator.scenario.simulate")}
          </ToolbarButton>
        }
        context={
          !isValid ? (
            <ToolbarDiagnostic tone="error">
              {errors.length > 1
                ? t("simulator.scenario.errors", { count: errors.length, first: errors[0] })
                : errors[0]}
            </ToolbarDiagnostic>
          ) : null
        }
        readout={
          <EditorFileActions
            isDirty={isDirty}
            onSave={saveNow}
            onDownload={download}
            onFormat={formatDocument}
          />
        }
      />
      <div className="min-h-0 flex-1 rounded">
        <Editor
          height="100%"
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
