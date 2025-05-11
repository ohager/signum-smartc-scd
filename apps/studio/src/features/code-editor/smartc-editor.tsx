import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import { SaveIcon, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProjectFile } from "@/types/project.ts";
import { useTheme } from "next-themes";
import { extendCLangWithSmartC } from "./language-definitions/smartc-language-definitions.ts";

interface Props {
  file: ProjectFile;
}

export function SmartCEditor({ file }: Props) {
  const [code, setCode] = useState(file.data);
  const [isDirty, setIsDirty] = useState(false);
  const [isValid, setIsValid] = useState(true);
  const {theme} = useTheme()
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState("calc(100vh - 120px)"); // Initial height

  useEffect(() => {
    const calculateEditorHeight = () => {
      if (containerRef.current) {
        const containerTop = containerRef.current.getBoundingClientRect().top;
        // Account for a small padding at the bottom (e.g., 16px)
        const newHeight = `calc(100vh - ${containerTop + 16}px)`;
        setEditorHeight(newHeight);
      }
    };

    calculateEditorHeight();
    // Recalculate if the window is resized
    window.addEventListener('resize', calculateEditorHeight);

    return () => window.removeEventListener('resize', calculateEditorHeight);
  }, []);


  const handleEditorChange = (value: string | undefined) => {
    if (value !== undefined) {
      setCode(value);
      setIsDirty(true);
      setIsValid(true);

    }
  };

  const handleSave = useCallback(() => {
    if (isValid) {
      setIsDirty(false);
    }
  }, [code, isValid]);

  const handleEditorDidMount: OnMount = (editor, monaco) => {
    console.log("Editor did mount!");

    extendCLangWithSmartC(monaco);
    editor.addAction({
      id: "test-action",
      run: (editor, ...args) => {
        console.log("Run Action", ...args)
      },
      label: "Compile"
    });
  };

  return (
    <div className="flex flex-col" ref={containerRef}>
      <section className="w-full flex justify-between items-center p-1">
        <div>
          {!isValid && (
            <span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <FileWarning className="h-4 w-4 text-yellow-100" />
                </TooltipTrigger>
                <TooltipContent side="right">
                  Invalid SmartC code - Check for errors
                </TooltipContent>
              </Tooltip>
            </span>
          )}
        </div>
        <div>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleSave}
                  disabled={!isValid}
                  className="disabled:cursor-none"
                >
                  <SaveIcon
                    className={isDirty ? "text-red-400" : "text-green-400"}
                  />
                </Button>
              </div>
            </TooltipTrigger>
            <TooltipContent>
              {isDirty ? "Unsaved changes" : "All Saved"}
            </TooltipContent>
          </Tooltip>
        </div>
      </section>
      <div className="flex-1 p-1 rounded h-full">
        <Editor
          height={editorHeight}
          defaultLanguage="c"
          value={code}
          theme={theme === "dark" ? "vs-dark" : "light"}
          onChange={handleEditorChange}
          onMount={handleEditorDidMount}
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
          }}
        />
      </div>
    </div>
  );
}
