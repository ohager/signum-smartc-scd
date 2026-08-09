import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import { validateScenario } from "./scenario-io";

function validationErrors(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    return ["JSON: " + e.message];
  }
  const r = validateScenario(parsed);
  return r.valid ? [] : r.errors;
}

export function ScenarioEditor({ file }: { file: File }) {
  const fs = useFileSystem();
  const { theme } = useTheme();
  const [content, setContent] = useState(file.content as string);
  const [errors, setErrors] = useState<string[]>(() => validationErrors(file.content as string));
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

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
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
        <span className="font-medium">Scenario</span>
        <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={save} disabled={errors.length > 0}>
          Save
        </button>
        <span className={"ml-auto " + (errors.length > 0 ? "text-red-500" : "opacity-70")}>
          {errors.length > 0 ? `${errors.length} error(s): ${errors[0]}` : "valid ✓"}
        </span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={content}
          theme={theme === "dark" ? "vs-dark" : "light"}
          onChange={onChange}
          onMount={onMount}
          options={{ minimap: { enabled: false }, fontSize: 14 }}
        />
      </div>
    </div>
  );
}
