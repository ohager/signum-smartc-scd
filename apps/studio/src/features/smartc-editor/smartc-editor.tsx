import { useCallback, useMemo, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { Code2 } from "lucide-react";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { registerSmartC, SMARTC_LANGUAGE_ID } from "./language/register.ts";
import {
  EditorFileActions,
  registerEditorFileActions,
} from "@/components/ui/editor/file-actions.tsx";
import { useEditorFile } from "@/components/ui/editor/use-editor-file.ts";
import {
  SurfaceToolbar,
  ToolbarButton,
  ToolbarDiagnostic,
} from "@/components/ui/surface-toolbar.tsx";
import { toast } from "sonner";
import { SmartC } from "smartc-signum-compiler";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { type File, FileSystem } from "@/lib/file-system";
import { FileTypes } from "@/features/project/filetype-icons.tsx";
import { findProjectOfFolder } from "@/features/project/project-root";
import { isContractFile } from "@/features/project/contract";
import { analyzeWithCompiler } from "./language/compiler-symbols";

async function createAssemblyFile(
  folderId: string,
  fileName: string,
  code: string,
) {
  try {
    const fs = FileSystem.getInstance();
    const folder = fs.getFolder(folderId);
    if (!folder) {
      throw new Error("Could not find folder:" + folderId);
    }
    const compiler = new SmartC({
      language: "C",
      sourceCode: code,
    });
    compiler.compile();
    const assembly = compiler.getAssemblyCode();
    await fs.addFile(folderId, fileName, FileTypes.ASM, assembly);
    toast.success(
      "Smart Contract compiled successfully - Assembly file created!",
    );
  } catch (e) {
    console.error(e);
    toast.error("Could not create Assembly file: ", e.message);
  }
}

async function updateAssemblyFile(fileId: string, code: string) {
  try {
    const fs = FileSystem.getInstance();
    if (!fs.exists(fileId)) {
      throw new Error("Could not find file:" + fileId);
    }
    if (fs.getFileMetadata(fileId)?.type !== FileTypes.ASM) {
      throw new Error("Existing File is not an Assembly file");
    }
    const compiler = new SmartC({
      language: "C",
      sourceCode: code,
    });
    compiler.compile();
    const assembly = compiler.getAssemblyCode();
    await fs.saveFile(fileId, assembly);
    toast.success(
      "Smart Contract compiled successfully - Assembly file updated!",
    );
  } catch (e) {
    console.error(e);
    toast.error("Could not update Assembly file: ", e.message);
  }
}

const COMPILE_HOTKEY =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/i.test(navigator.userAgent)
    ? "\u21e7\u2318C"
    : "Ctrl+Shift+C";

interface Props {
  file: File;
}

enum ActionType {
  Compile = "compile",
}

function SmartCEditor({ file }: Props) {
  const fs = useFileSystem();
  const {
    text: code,
    isDirty,
    onChange: handleEditorChange,
    saveNow: saveSmartCFile,
    download,
  } = useEditorFile({
    file,
    // The rail's Write cell reports this, and `handleValidate` is the wrong
    // place for it: Monaco validates the *buffer*, while `lastModified`
    // describes the *save*. Filing a buffer verdict under a save timestamp
    // would report a fault in code that is not on disk. Both halves have to
    // describe the same bytes, so the verdict goes where the bytes land.
    onSaved: (written) => {
      const projectId = findProjectOfFolder(fs, file.metadata.folderId);
      const saved = fs.getFileMetadata(file.metadata.id);
      if (!projectId || !saved || !isContractFile(saved.name)) return;

      // Never throws, and is the same call the language service makes for its
      // markers — one implementation of "does this compile", not two.
      const { error } = analyzeWithCompiler(written);
      fs.status.recordCompile(projectId, {
        sourceModified: saved.lastModified,
        errorCount: error ? 1 : 0,
      });
    },
  });
  const [validationError, setValidationError] = useState("");
  const monacoTheme = useMonacoTheme();
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isValid = !validationError;

  // TODO: candidate for being extracted to some FilePath lib
  const baseName = useMemo(() => {
    if (!file) return "";
    return file.metadata.name.split(".")[0];
  }, [file]);

  const compileSmartC = useCallback(async () => {
    const { files } = fs.listFolderContents(file.metadata.folderId);
    if (files.find(({ metadata: { type } }) => type === FileTypes.ASM)) {
      setShowConfirmDialog(true);
      return;
    }

    const fileName = baseName + ".asm";
    return createAssemblyFile(file.metadata.folderId, fileName, code);
  }, [baseName, code]);

  const recompileSmartC = useCallback(async () => {
    if (!code) {
      console.warn("No Code");
      return;
    }
    const { files } = fs.listFolderContents(file.metadata.folderId);
    const existingFile = files.find((f) => f.metadata.type === FileTypes.ASM);
    if (!existingFile) {
      return toast.error("Could not find existing file");
    }
    return updateAssemblyFile(existingFile.id, code);
  }, [code, baseName]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editor.addAction({
      id: ActionType.Compile,
      // TODO: this is not good... we need to use events
      run: compileSmartC,
      label: "Compile SmartC",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC,
      ],
    });
    registerEditorFileActions(editor, monaco, { onDownload: download });
  };

  const handleValidate = (markers: any[]) => {
    // Only compile errors block save/compile; warnings are informational.
    const MARKER_SEVERITY_ERROR = 8; // monaco.MarkerSeverity.Error
    const firstError = markers.find(
      (m) => m.severity === MARKER_SEVERITY_ERROR,
    );
    setValidationError(firstError?.message ?? "");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SurfaceToolbar
        verbs={
          <ToolbarButton
            weight="primary"
            onClick={compileSmartC}
            disabled={!isValid}
            title={
              isValid
                ? `Compile this contract (${COMPILE_HOTKEY})`
                : "Fix the error before compiling"
            }
          >
            <Code2 className="h-4 w-4" />
            Compile
          </ToolbarButton>
        }
        context={
          !isValid ? (
            <ToolbarDiagnostic tone="error">{validationError}</ToolbarDiagnostic>
          ) : null
        }
        readout={
          <EditorFileActions
            isDirty={isDirty}
            onSave={saveSmartCFile}
            onDownload={download}
          />
        }
      />
      <div className="min-h-0 flex-1 rounded">
        <Editor
          height="100%"
          defaultLanguage={SMARTC_LANGUAGE_ID}
          value={code}
          theme={monacoTheme}
          onChange={handleEditorChange}
          beforeMount={(monaco) => registerSmartC(monaco)}
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
            wordBasedSuggestions: "off",
          }}
        />
      </div>
      <ConfirmationDialog
        open={showConfirmDialog}
        onOpenChange={setShowConfirmDialog}
        onConfirm={recompileSmartC}
        title="Compile SmartC"
        description="An assembly file already exists. All previous code will be overwritten if you re-compile"
        confirmText="Re-Compile"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  );
}

export default SmartCEditor;
