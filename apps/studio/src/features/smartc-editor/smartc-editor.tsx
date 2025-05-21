import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { SaveIcon, FileWarning, Code2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { extendCLangWithSmartC } from "./language-definitions/smartc-language-definitions.ts";
import { EditorActionButton } from "@/components/ui/editor/actionButton.tsx";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { toast } from "sonner";
import { SmartC } from "smartc-signum-compiler";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { type File, FileSystem } from "@/lib/file-system";
import { FileTypes } from "@/features/project/filetype-icons.tsx";

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

const preventDefaultSave = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
  }
};

interface Props {
  file: File;
}

enum ActionType {
  Compile = "compile",
}

function SmartCEditor({ file }: Props) {
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const fs = useFileSystem();
  const [code, setCode] = useState(file.content as string);
  const [isDirty, setIsDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState("calc(100vh)"); // Initial height
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isValid = !validationError;

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
    window.addEventListener("keydown", preventDefaultSave);

    return () => {
      window.removeEventListener("resize", calculateEditorHeight);
      window.removeEventListener("keydown", preventDefaultSave);
    };
  }, []);

  useEffect(() => {
    addAction({
      id: ActionType.Compile,
      tooltip: "Compiles SmartC Code",
      label: "Compile",
      icon: <Code2 className="h-4 w-4" />,
      onClick: compileSmartC,
      variant: "accent",
    });

    return () => {
      removeAction(ActionType.Compile);
    };
  }, [addAction, removeAction]);

  useEffect(() => {
    updateAction({
      id: ActionType.Compile,
      updates: { disabled: !isValid },
    });
  }, [isValid, updateAction]);

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

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      setIsDirty(true);
    }
  };

  const saveSmartCFile = useCallback(async () => {
    try {
      if (!isValid) {
        toast.warning("Cannot save file! Please fix the errors first");
        return;
      }
      setIsDirty(false);
      await fs.saveFile(file.metadata.id, code);
      toast.success("File saved successfully!");
    } catch (e) {
      toast.error("Could not save file: " + e.message);
    }
  }, [code, isValid, file]);

  useEffect(() => {
    removeAllSaveHandlers();
    addSaveEventListener(saveSmartCFile);

    return removeAllSaveHandlers;
  }, [saveSmartCFile]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    extendCLangWithSmartC(monaco);
    editor.addAction({
      id: ActionType.Compile,
      // TODO: this is not good... we need to use events
      run: compileSmartC,
      label: "Compile SmartC",
      keybindings: [
        monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC,
      ],
    });
    editor.addAction({
      id: "save-content",
      label: "Save Content",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
      contextMenuGroupId: "navigation",
      contextMenuOrder: 1.5,
      run: () => {
        document.dispatchEvent(new CustomEvent("editor:save"));
      },
    });
  };

  const handleValidate = (markers: any[]) => {
    console.log("SmartC Validation:", markers);
    const error = markers.length > 0 ? markers[0].message : undefined;
    setValidationError(error ?? "");
  };

  return (
    <div className="flex flex-col" ref={containerRef}>
      <section className="w-full flex justify-between items-center pt-1 px-2 h-[30px] bg-muted border-b-1">
        <div>
          {!isValid && (
            <span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1">
                    <FileWarning className="h-4 w-4 text-red-600" />
                    <small className="text-xs text-red-600 ">
                      {validationError}
                    </small>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">Invalid SCD</TooltipContent>
              </Tooltip>
            </span>
          )}
        </div>
        <div>
          <EditorActionButton
            tooltip={isDirty ? "Unsaved changes" : "All Saved"}
            disabled={!isValid}
            onClick={saveSmartCFile}
          >
            <SaveIcon className={isDirty ? "text-red-600" : "text-green-600"} />
          </EditorActionButton>
        </div>
      </section>
      <div className="flex-1 rounded h-full">
        <Editor
          height={editorHeight}
          defaultLanguage="c"
          value={code}
          theme={theme === "dark" ? "vs-dark" : "light"}
          onChange={handleEditorChange}
          beforeMount={(monaco) => {}}
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
