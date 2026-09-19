import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { EditorToolbar } from "@/components/ui/editor/editor-toolbar.tsx";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { registerClimateThemes } from "@/theme/monaco-themes";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "react-router";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import {
  EditorFileActions,
  registerEditorFileActions,
} from "@/components/ui/editor/file-actions.tsx";
import { useEditorFile } from "@/components/ui/editor/use-editor-file.ts";
import type { File } from "@/lib/file-system";
import { DebugView } from "@/features/simulator/ui/debug-view";
import { serializeScenario } from "@/features/simulator/scenario/scenario-io";
import { configureTypeScriptForTests } from "../monaco-setup";
import { useTestRun } from "../use-test-run";
import { toDebugScenario } from "../to-debug-scenario";
import { TestResultsPanel } from "./test-results-panel";
import { useTestDecorations } from "./use-test-decorations";
import { findTests, type FoundTest } from "../instrument/find-tests";
import { useCursorTest } from "./use-cursor-test";
import { transpileAll } from "../transpile";
import { useValueDecorations } from "./use-value-decorations";
import { DevToolsHelp } from "./devtools-help";
import { ValuePanel } from "./value-panel";
import { fileTraceAtom, activeTestIdAtom, inspectedLineAtom } from "../test-trace-store";

interface Props {
  file: File;
}

export function TestFileEditor({ file }: Props) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const monacoTheme = useMonacoTheme();
  const monacoRef = useRef<typeof Monaco | null>(null);
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const {
    text: code,
    isDirty,
    onChange: onCodeChange,
    save,
    saveNow,
    download,
  } = useEditorFile({ file });
  const { state, isRunning, run } = useTestRun();
  const [foundTests, setFoundTests] = useState<FoundTest[]>([]);
  // Monaco and the editor arrive via onMount, after the first render. Without a
  // state flag nothing re-runs, so the gutter stayed empty until a keystroke.
  const [editorReady, setEditorReady] = useState(false);

  const traceForFile = useAtomValue(fileTraceAtom);
  const setActiveTestId = useSetAtom(activeTestIdAtom);
  const activeTestId = useAtomValue(activeTestIdAtom);
  const setInspectedLine = useSetAtom(inspectedLineAtom);
  const [rightTab, setRightTab] = useState("results");

  const inspectLine = useCallback(
    (line: number) => {
      setInspectedLine({ file: file.metadata.path, line });
      setRightTab("value");
    },
    [file.metadata.path, setInspectedLine],
  );

  useValueDecorations(
    editorRef.current,
    monacoRef.current,
    traceForFile(file.metadata.path),
    inspectLine,
  );
  const [debugging, setDebugging] = useState(false);
  const [debugRun, setDebugRun] = useState(false);

  const recording = state.recordings?.[file.metadata.path];
  const activeRow = state.rows.find((row) => row.id === activeTestId);

  // acorn cannot parse TypeScript, so the scan runs on the emitted JavaScript —
  // which is also the form the runner sees, so both agree about what a test is.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      transpileAll(monaco, { [file.metadata.path]: code })
        .then((modules) => {
          if (cancelled) return;
          const compiled = modules[file.metadata.path];
          if (!compiled) return;
          setFoundTests(findTests(compiled.js, compiled.sourceMap));
        })
        // A half-typed file simply leaves the previous markers standing.
        .catch(() => {});
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, file.metadata.path, editorReady]);

  const onMount: OnMount = (editor, monaco) => {
    // @ts-ignore — @monaco-editor/react resolves its own nested monaco-editor
    // version, which structurally diverges from the root one; see the same
    // workaround in debug-view.tsx's onMount.
    editorRef.current = editor;
    monacoRef.current = monaco;
    registerClimateThemes(monaco);
    configureTypeScriptForTests(monaco);
    registerEditorFileActions(editor, monaco, { onDownload: download });
    setEditorReady(true);
  };

  const revealLine = useCallback((line: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  }, []);

  const runFile = useCallback(
    async (filter?: string[]) => {
      const monaco = monacoRef.current;
      if (!monaco) return;
      // Save first: the runner reads the project from the file system, not
      // the editor buffer. Quietly — the user asked for a run, not a save.
      await save({ silent: true });
      await run(monaco, projectId, { entryPath: file.metadata.path, debug: debugRun, filter });
    },
    [save, file.metadata.path, projectId, run, debugRun],
  );

  const runSingleTest = useCallback(
    (path: string[]) => {
      runFile(path).catch((e) => toast.error("Could not run test: " + (e as Error).message));
    },
    [runFile],
  );

  // The hooks below read refs that onMount fills. Setting editorReady there
  // re-renders, at which point those refs are non-null and the effects re-run
  // on a genuine dependency change.
  useTestDecorations(editorRef.current, monacoRef.current, state.rows, foundTests, runSingleTest);

  // The cursor picks the active test, whose values the editor annotates. Rows
  // are matched by name path rather than id: ids are collection-order counters
  // that shift as tests are added, while the path is what the scan knows.
  const selectTestAtCursor = useCallback(
    (test: FoundTest) => {
      const row = state.rows.find(
        (candidate) =>
          candidate.path.length === test.path.length &&
          candidate.path.every((part, at) => part === test.path[at]),
      );
      if (row) setActiveTestId(row.id);
    },
    [state.rows, setActiveTestId],
  );

  useCursorTest(editorRef.current, foundTests, selectTestAtCursor);

  /**
   * Re-runs the active test on its own, then opens the step debugger on it.
   *
   * Running first is what makes the recording per-test: the runner captures one
   * recording per entry file, so a whole-file run yields every test's
   * transactions concatenated — which is rarely what you want to step through.
   */
  const debugActiveTest = useCallback(async () => {
    const row = state.rows.find((candidate) => candidate.id === activeTestId);
    if (!row) return;
    await runFile(row.path);
    setDebugging(true);
  }, [state.rows, activeTestId, runFile]);

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

  if (debugging && !recording?.contractSource) {
    return (
      <div className="flex flex-col items-start gap-2 p-4">
        <p className="text-sm text-muted-foreground">
          {activeRow ? `"${activeRow.name}" loaded no contract` : "No contract was loaded"}, so
          there is nothing to step through.
        </p>
        <Button variant="outline" size="sm" onClick={() => setDebugging(false)}>
          Back to the editor
        </Button>
      </div>
    );
  }

  if (debugging && recording?.contractSource) {
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <p className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
          Replays the recorded transaction stream — assertions do not re-evaluate while stepping. Only the
          last-loaded contract is steppable.
        </p>
        <div className="min-h-0 flex-1">
          <DebugView
            source={recording.contractSource}
            scenarios={[{ name: "from test run", json: serializeScenario(toDebugScenario(recording)) }]}
            onClose={() => setDebugging(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-0 flex-1">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="flex h-full flex-col">
            <EditorToolbar
              actions={
                <EditorFileActions
                  isDirty={isDirty}
                  onSave={saveNow}
                  onDownload={download}
                />
              }
            >
              {isRunning && (
                <span className="motion-pulse text-[var(--accent-3)]">running…</span>
              )}
            </EditorToolbar>
            {activeRow && (
              <div className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
                showing values from:{" "}
                {activeRow.path.length ? activeRow.path.join(" › ") : activeRow.name}
                {activeRow.traceTruncated && " — trace truncated, some values were not recorded"}
              </div>
            )}
            <div className="min-h-0 flex-1">
              <Editor
                height="100%"
                language="typescript"
                path={"file://" + file.metadata.path}
                theme={monacoTheme}
                value={code}
                onChange={onCodeChange}
                onMount={onMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  glyphMargin: true,
                }}
              />
            </div>
          </div>
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={40} minSize={20}>
          <div className="flex h-full flex-col">
            <label className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={debugRun}
                onCheckedChange={(checked) => setDebugRun(checked === true)}
              />
              Debug run (DevTools)
              <DevToolsHelp />
              <span className="text-muted-foreground/70">
                — runs in the page so DevTools can break; a runaway contract will freeze the tab
              </span>
            </label>
            <Tabs
              value={rightTab}
              onValueChange={setRightTab}
              className="flex min-h-0 flex-1 flex-col gap-0"
            >
              <TabsList className="mx-3 mt-2 shrink-0 self-start">
                <TabsTrigger value="results">Results</TabsTrigger>
                <TabsTrigger value="value">Value</TabsTrigger>
              </TabsList>
              <TabsContent value="results" className="min-h-0 flex-1">
                <TestResultsPanel
                  state={state}
                  onRevealLine={revealLine}
                  onDebug={
                    activeTestId && !isRunning
                      ? () => {
                          debugActiveTest().catch((e) =>
                            toast.error("Could not debug test: " + (e as Error).message),
                          );
                        }
                      : undefined
                  }
                  activeTestId={activeTestId}
                  onSelectTest={setActiveTestId}
                />
              </TabsContent>
              <TabsContent value="value" className="min-h-0 flex-1">
                <ValuePanel />
              </TabsContent>
            </Tabs>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
