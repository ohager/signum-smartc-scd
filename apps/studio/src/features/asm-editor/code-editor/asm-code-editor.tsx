import { useCallback, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  EditorToolbar,
  EditorDiagnostic,
} from "@/components/ui/editor/editor-toolbar.tsx";
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
    <div className="flex min-h-0 flex-1 flex-col">
      <EditorToolbar
        actions={
          <EditorFileActions
            isDirty={isDirty}
            onSave={saveAsmFile}
            onDownload={download}
          />
        }
      >
        {!isValid && (
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <EditorDiagnostic tone="error">{validationError}</EditorDiagnostic>
              </span>
            </TooltipTrigger>
            <TooltipContent side="right">Invalid assembly</TooltipContent>
          </Tooltip>
        )}
        <small className="truncate opacity-70">
          Change this file only if you know what you are doing! (Each smart.c
          compilation will overwrite your manual changes)
        </small>
      </EditorToolbar>
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
