import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "react-router";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import { configureTypeScriptForTests } from "../monaco-setup";
import { useTestRun } from "../use-test-run";
import { TestResultsPanel } from "./test-results-panel";

interface Props {
  file: File;
}

export function TestFileEditor({ file }: Props) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const fs = useFileSystem();
  const { theme } = useTheme();
  const monacoRef = useRef<typeof Monaco | null>(null);
  const [code, setCode] = useState(file.content as string);
  const codeRef = useRef(code);
  codeRef.current = code;
  const { state, isRunning, run } = useTestRun();

  // `h-full` does not resolve here: PageContent (src/components/ui/page.tsx)
  // is a plain block div, not a flex container, so a percentage height on its
  // child has no definite containing block to resolve against. The sibling
  // editors (smartc-editor.tsx, scenario-editor.tsx) hit the same constraint
  // and work around it by measuring the container's viewport offset and
  // sizing with `calc(100vh - top)`; this follows the same convention.
  const containerRef = useRef<HTMLDivElement>(null);
  const [panelHeight, setPanelHeight] = useState("calc(100vh)");

  useEffect(() => {
    const calculatePanelHeight = () => {
      if (containerRef.current) {
        const containerTop = containerRef.current.getBoundingClientRect().top;
        setPanelHeight(`calc(100vh - ${containerTop}px)`);
      }
    };

    calculatePanelHeight();
    window.addEventListener("resize", calculatePanelHeight);
    return () => window.removeEventListener("resize", calculatePanelHeight);
  }, []);

  const onMount: OnMount = (_editor, monaco) => {
    monacoRef.current = monaco;
    configureTypeScriptForTests(monaco);
  };

  const runFile = useCallback(async () => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    // Save first: the runner reads the project from the file system, not the editor buffer.
    await fs.saveFile(file.metadata.id, codeRef.current);
    await run(monaco, projectId, file.metadata.path);
  }, [fs, file.metadata.id, file.metadata.path, projectId, run]);

  useEffect(() => {
    addAction({
      id: "run-tests",
      tooltip: "Run this test file",
      label: "Run",
      icon: <Play className="h-4 w-4" />,
      onClick: () => {
        runFile().catch((e) => toast.error("Could not run tests: " + (e as Error).message));
      },
      variant: "accent",
    });
    return () => removeAction("run-tests");
  }, [addAction, removeAction, runFile]);

  useEffect(() => {
    updateAction({ id: "run-tests", updates: { disabled: isRunning } });
  }, [isRunning, updateAction]);

  return (
    <div ref={containerRef} style={{ height: panelHeight }}>
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={60} minSize={30}>
          <Editor
            height="100%"
            language="typescript"
            path={"file://" + file.metadata.path}
            theme={theme === "dark" ? "vs-dark" : "light"}
            value={code}
            onChange={(value) => setCode(value ?? "")}
            onMount={onMount}
            options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
          />
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={40} minSize={20}>
          <TestResultsPanel state={state} />
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
