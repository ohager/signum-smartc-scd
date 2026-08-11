import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import JSON5 from "json5";
import { validateScenario } from "./scenario-io";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { downloadBlob } from "@/lib/download.ts";
import { DownloadIcon } from "lucide-react";

const TOOLBAR_HEIGHT = 30;

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

    return () => {
      window.removeEventListener("resize", calculateEditorHeight);
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


  const onChange = (value: string | undefined) => {
    const text = value ?? "";
    setContent(text);
    setErrors(validationErrors(text));
  };

  const save = useCallback(async () => {
    if (errors.length > 0) {
      toast.warning("Fix scenario errors before saving");
      return;
    }
    try {
      await fs.saveFile(file.metadata.id, content);
      toast.success("Scenario saved");
    } catch (e: any) {
      toast.error("Could not save: " + e.message);
    }
  }, [content, errors, file.metadata.id]);

  return (
    <div className="flex flex-col" ref={containerRef}>
      <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
        <span className="font-medium">Scenario</span>
        <button
          className="px-2 py-0.5 border rounded disabled:opacity-40"
          onClick={save}
          disabled={errors.length > 0}
        >
          Save
        </button>
        <span
          className={
            "ml-auto " + (errors.length > 0 ? "text-red-500" : "opacity-70")
          }
        >
          {errors.length > 0
            ? `${errors.length} error(s): ${errors[0]}`
            : "valid ✓"}
        </span>
      </div>
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
