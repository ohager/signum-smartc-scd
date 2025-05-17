import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { SaveIcon, FileWarning, Code2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProjectFile } from "@/types/project.ts";
import { useTheme } from "next-themes";
import { extendCLangWithSmartC } from "./language-definitions/smartc-language-definitions.ts";
import { EditorActionButton } from "@/components/ui/editor/actionButton.tsx";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { toast } from "sonner";
import { useSingleProject } from "@/hooks/use-single-project.ts";
import { SmartC } from "smartc-signum-compiler";
import { useProjects } from "@/hooks/use-projects.ts";
import { useFile } from "@/hooks/use-file.ts";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog.tsx";

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
  file: ProjectFile;
}

enum ActionType {
  Compile = "compile",
}

function SmartCEditor({ file }: Props) {
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const { addFile } = useSingleProject();
  const { projects } = useProjects();
  const { saveFile } = useFile();
  const [code, setCode] = useState(file.data);
  const [isDirty, setIsDirty] = useState(false);
  const [validationError, setValidationError] = useState("");
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState("calc(100vh)"); // Initial height
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const isValid = !validationError;

  const currentProject = useMemo(() => {
    return projects.find((p) => p.id === file.projectId);
  }, [projects]);

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

  const createAssemblyFile = useCallback(
    async (fileName: string, overwrite = false) => {
      try {
        const compiler = new SmartC({
          language: "C",
          sourceCode: code,
        });
        compiler.compile();
        const assembly = compiler.getAssemblyCode();
        if (overwrite) {
          const existingFile = currentProject?.files.find(
            (f) => f.name === fileName,
          );
          if (!existingFile) {
            throw new Error("Could not find file: " + fileName);
          }
          existingFile.data = assembly;
          await saveFile(existingFile);
          toast.success("Assembly Code successfully re-generated!");
        } else {
          addFile({
            projectId: file.projectId,
            fileName,
            type: "asm",
            data: assembly,
          });
          toast.success(
            "Smart Contract compiled successfully - Assembly file created!",
          );
        }
      } catch (e) {
        console.error(e);
        toast.error("Could not compile SmartC file:" + e.message);
      }
    },
    [addFile, file, code],
  );

  const compileSmartC = useCallback(async () => {
    if (!currentProject) {
      console.error("Invalid project id", file.projectId);
      toast.error("Invalid Project");
      return;
    }
    const fileName = currentProject.name + ".asm";

    if (currentProject.files.find((f) => f.name === fileName)) {
      setShowConfirmDialog(true);
      return;
    }

    return createAssemblyFile(fileName);
  }, [file.name, file.projectId, currentProject]);

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
      file.data = code;
      await saveFile(file);
      toast.success("File saved successfully!");
    } catch (e) {
      toast.error("Could not save file: " + e.message);
    }
  }, [code, isValid]);

  useEffect(() => {
    removeAllSaveHandlers();
    addSaveEventListener(() => {
      saveSmartCFile();
    });

    return removeAllSaveHandlers;
  }, [validationError]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    extendCLangWithSmartC(monaco);
    editor.addAction({
      id: ActionType.Compile,
      run: compileSmartC,
      label: "Compile SmartC",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC]
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
          createAssemblyFile(currentProject!.name + ".asm", true)
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

export default SmartCEditor;
