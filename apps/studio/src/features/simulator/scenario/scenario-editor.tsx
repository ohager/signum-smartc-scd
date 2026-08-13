import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import JSON5 from "json5";
import { validateScenario } from "./scenario-io";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { downloadBlob } from "@/lib/download.ts";
import { AlignLeft, DownloadIcon, FileWarning, SaveIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditorActionButton } from "@/components/ui/editor/actionButton.tsx";

const TOOLBAR_HEIGHT = 30;

const preventDefaultSave = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
  }
};

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
  const fs = useFileSystem();
  const { addAction, removeAction } = usePageHeaderActions();
  const { theme } = useTheme();
  const [content, setContent] = useState(file.content as string);
  const contentRef = useRef(content);
  contentRef.current = content;
  const [errors, setErrors] = useState<string[]>(() => validationErrors(file.content as string));
  const [isDirty, setIsDirty] = useState(false);
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
    window.addEventListener("keydown", preventDefaultSave);

    return () => {
      window.removeEventListener("resize", calculateEditorHeight);
      window.removeEventListener("keydown", preventDefaultSave);
    };
  }, []);

  useEffect(() => {
    addAction({
      id: "download",
      tooltip: "Download this file",
      label: "Download",
      icon: <DownloadIcon className="h-4 w-4" />,
      onClick: () =>
        downloadBlob(
          file.metadata.name,
          new Blob([contentRef.current], { type: "text/plain;charset=utf-8" }),
        ),
      variant: "default",
    });
    return () => removeAction("download");
  }, [addAction, removeAction, file.metadata.name]);

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

  useEffect(() => {
    addAction({
      id: "format",
      tooltip: "Re-indent this scenario (Shift+Alt+F)",
      label: "Format",
      icon: <AlignLeft className="h-4 w-4" />,
      onClick: formatDocument,
      variant: "default",
    });
    return () => removeAction("format");
  }, [addAction, removeAction, formatDocument]);

  const onChange = (value: string | undefined) => {
    const text = value ?? "";
    setContent(text);
    setIsDirty(true);
    setErrors(validationErrors(text));
  };

  const save = useCallback(async () => {
    if (errors.length > 0) {
      toast.warning("Fix scenario errors before saving");
      return;
    }
    try {
      await fs.saveFile(file.metadata.id, content);
      setIsDirty(false);
      toast.success("Scenario saved");
    } catch (e: any) {
      toast.error("Could not save: " + e.message);
    }
  }, [content, errors, file.metadata.id]);

  useEffect(() => {
    document.addEventListener("editor:save", save);
    return () => document.removeEventListener("editor:save", save);
  }, [save]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
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
                      {errors.length > 1
                        ? `${errors.length} errors: ${errors[0]}`
                        : errors[0]}
                    </small>
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right">Invalid scenario</TooltipContent>
              </Tooltip>
            </span>
          )}
        </div>
        <div>
          <EditorActionButton
            tooltip={isDirty ? "Unsaved changes" : "All Saved"}
            disabled={!isValid}
            onClick={save}
          >
            <SaveIcon className={isDirty ? "text-red-600" : "text-green-600"} />
          </EditorActionButton>
        </div>
      </section>
      <div className="flex-1 rounded h-full">
        <Editor
          height={editorHeight}
          defaultLanguage="json"
          value={content}
          theme={theme === "dark" ? "vs-dark" : "light"}
          onChange={onChange}
          beforeMount={(monaco) =>
            monaco.languages.json?.jsonDefaults.setDiagnosticsOptions({ validate: false })
          }
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
