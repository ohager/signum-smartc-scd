import { useCallback, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { useNavigate } from "react-router";
import { Rocket } from "lucide-react";
import {
  SurfaceToolbar,
  ToolbarButton,
  ToolbarDiagnostic,
} from "@/components/ui/surface-toolbar.tsx";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { findProjectOfFolder } from "@/features/project/project-root";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import {
  EditorFileActions,
  registerEditorFileActions,
} from "@/components/ui/editor/file-actions.tsx";
import { useEditorFile } from "@/components/ui/editor/use-editor-file.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { registerAsmLanguage } from "./language-definitions/asm-language-definitions.ts";
import { type File } from "@/lib/file-system";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import { tryAssemble } from "../lib/try-assemble.ts";

interface Props {
  file: File;
  onSave: (isValid: boolean, machineCode?: MachineData) => void;
}

function AsmCodeEditor({ file, onSave }: Props) {
  const navigate = useNavigate();
  const fs = useFileSystem();
  // The folder an `.asm` sits in is not always the project itself — the same
  // resolution the rail uses keeps the two in step.
  const projectId = findProjectOfFolder(fs, file.metadata.folderId);
  const [validationError, setValidationError] = useState("");
  const monacoTheme = useMonacoTheme("asm");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isValid = !validationError;

  // Assembling is how the machine-data panel gets its numbers; unassemblable
  // text still saves, it just leaves the panel without data.
  const reportMachineCode = useCallback(
    (written: string) => {
      try {
        onSave(true, tryAssemble(written));
      } catch {
        onSave(false);
      }
    },
    [onSave],
  );

  const {
    text: code,
    isDirty,
    onChange: handleEditorChange,
    saveNow: saveAsmFile,
    download,
  } = useEditorFile({ file, onSaved: reportMachineCode });

  const handleEditorBeforeMount: BeforeMount = (monaco) => {
    registerAsmLanguage(monaco);
  };

  const handleValidate = (markers: any[]) => {
    const error = markers.length > 0 ? markers[0].message : undefined;
    setValidationError(error ?? "");
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    registerEditorFileActions(editor, monaco, { onDownload: download });
  };
  return (
    // `h-full`, not `flex-1`: this editor's parent is a ResizablePanel, which
    // is a plain block box with a definite height, not a flex container. A
    // `flex-1` root there sizes to its content instead of the panel, and
    // Monaco — which has no intrinsic height — collapses to nothing.
    <div className="flex h-full min-h-0 flex-col">
      <SurfaceToolbar
        verbs={
          <ToolbarButton
            weight="primary"
            onClick={() =>
              projectId && navigate(`/projects/${projectId}/deploy`)
            }
            disabled={!projectId}
            title="Publish this contract to the chain"
          >
            <Rocket className="h-4 w-4" />
            Deploy
          </ToolbarButton>
        }
        context={
          <>
            {!isValid && (
              <ToolbarDiagnostic tone="error">
                {validationError}
              </ToolbarDiagnostic>
            )}
            {/* The file is a build product: the next compile overwrites it.
                One line in the interface's voice, where the old prose was a
                shouted parenthesis. */}
            <ToolbarDiagnostic tone="warning">
              Hand edits are overwritten by the next compile
            </ToolbarDiagnostic>
          </>
        }
        readout={
          <EditorFileActions
            isDirty={isDirty}
            onSave={saveAsmFile}
            onDownload={download}
          />
        }
      />
      <div className="min-h-0 flex-1 rounded">
        <Editor
          height="100%"
          defaultLanguage="asm"
          value={code}
          theme={monacoTheme}
          onChange={handleEditorChange}
          beforeMount={handleEditorBeforeMount}
          onMount={handleEditorDidMount}
          onValidate={handleValidate}
          options={{
            minimap: { enabled: true },
            scrollBeyondLastLine: false,
            fontSize: 14,
            wordWrap: "on",
            automaticLayout: true,
            tabSize: 2,
            lineNumbers: "on",
            glyphMargin: true,
            snippetSuggestions: "top",
            suggestOnTriggerCharacters: true,
            renderValidationDecorations: "on",
          }}
        />
      </div>
      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={() => console.log("Re-Compile")}
        title="Compile SmartC"
        description="An assembly file already exists. All previous code will be overwritten if you re-compile"
        confirmText="Re-Compile"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  );
}

export default AsmCodeEditor;
