import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type BeforeMount, type OnMount } from "@monaco-editor/react";
import { SaveIcon, FileWarning, Code2, FileDigitIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "next-themes";
import { EditorActionButton } from "@/components/ui/editor/actionButton.tsx";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { toast } from "sonner";
import { useFile } from "@/hooks/use-file.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";
import { registerAsmLanguage } from "./language-definitions/asm-language-definitions.ts";
import { type File } from "@/lib/file-system";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { SmartC } from "smartc-signum-compiler";
import { FileTypes } from "@/features/project/filetype-icons.tsx";

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

function AsmEditor({ file }: Props) {
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const fs = useFileSystem();
  const { saveFile } = useFile();
  const [code, setCode] = useState(file.content as string);
  const [isDirty, setIsDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState("calc(100vh)"); // Initial height
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isValid = !validationError;

  const assembly = useCallback(() => {
    try {
      const compiler = new SmartC({
        language: "Assembly",
        sourceCode: code,
      });
      const machineCode = compiler.compile().getMachineCode();
      console.log("Machine code:", machineCode);
      toast.success("Created byte code successfully!");
    } catch (e) {
      toast.error("Could not compile Assembly: " + e.message);
    }
  }, [code])

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
      icon: <FileDigitIcon className="h-4 w-4" />,
      onClick: assembly,
      variant: "accent",
    });

    return () => {
      removeAction(ActionType.Compile);
    };
  }, [addAction, removeAction, assembly]);

  useEffect(() => {
    updateAction({
      id: ActionType.Compile,
      updates: { disabled: !isValid },
    });
  }, [isValid, updateAction]);

  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      setIsDirty(true);
    }
  };

  const saveAsmFile = useCallback(async () => {
    try {
      // if (!isValid) {
      //   toast.warning("Cannot save file! Please fix the errors first");
      //   return;
      // }
      await fs.saveFile(file.metadata.id, code);
      setIsDirty(false);
      toast.success("File saved successfully!");
    } catch (e) {
      toast.error("Could not save file: " + e.message);
    }
  }, [code]);





  useEffect(() => {
    window.addEventListener('editor:save', saveAsmFile)
    return () => {
      window.removeEventListener('editor:save', saveAsmFile)
    }
  }, [saveAsmFile]);

  const handleEditorBeforeMount: BeforeMount = (monaco) => {
    registerAsmLanguage(monaco);
  };

  const handleValidate = (markers: any[]) => {
    console.log("ASM Validation:", markers);
    const error = markers.length > 0 ? markers[0].message : undefined;
    setValidationError(error ?? "");
  };

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editor.addAction({
      id: ActionType.Compile,
      // TODO: this is not good... we need to use events
      run: assembly,
      label: "Compile ASM",
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
  }
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
            onClick={saveAsmFile}
          >
            <SaveIcon className={isDirty ? "text-red-600" : "text-green-600"} />
          </EditorActionButton>
        </div>
      </section>
      <div className="flex-1 rounded h-full">
        <Editor
          height={editorHeight}
          defaultLanguage="asm"
          value={code}
          theme={theme === "dark" ? "asm-dark" : "asm-light"}
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
        onConfirm={() =>
          console.log("Re-Compile")
        }
        title="Compile SmartC"
        description="An assembly file already exists. All previous code will be overwritten if you re-compile"
        confirmText="Re-Compile"
        cancelText="Cancel"
        variant="destructive"
      />
    </div>
  );
}

export default AsmEditor;
