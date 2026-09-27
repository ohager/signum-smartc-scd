import { useCallback, useEffect, useRef, useState } from "react";
import { useAtomValue, useSetAtom } from "jotai";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import {
  SurfaceToolbar,
  ToolbarButton,
} from "@/components/ui/surface-toolbar.tsx";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { registerClimateThemes } from "@/theme/monaco-themes";
import { Play, StepForward } from "lucide-react";
import { toast } from "sonner";
import { useNavigate, useParams } from "react-router";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { findProjectOfFolder } from "@/features/project/project-root";
import { contractOfProject } from "@/features/project/contract";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  EditorFileActions,
  registerEditorFileActions,
} from "@/components/ui/editor/file-actions.tsx";
import { useEditorFile } from "@/components/ui/editor/use-editor-file.ts";
import type { File } from "@/lib/file-system";
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
import {
  fileTraceAtom,
  activeTestIdAtom,
  inspectedLineAtom,
} from "../test-trace-store";

interface Props {
  file: File;
}

export function TestFileEditor({ file }: Props) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const fs = useFileSystem();
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
  const [debugRun, setDebugRun] = useState(false);

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

  // A single-test run reaches "done" through this same path, and its counts
  // describe one test. Filing those as the file's verdict would report
  // "1 green" for a file of twelve, so only an unfiltered run may speak for it.
  const lastRunWasFiltered = useRef(false);

  const runFile = useCallback(
    async (filter?: string[]) => {
      const monaco = monacoRef.current;
      if (!monaco) return null;
      lastRunWasFiltered.current = !!filter?.length;
      // Save first: the runner reads the project from the file system, not
      // the editor buffer. Quietly — the user asked for a run, not a save.
      await save({ silent: true });
      return run(monaco, projectId, {
        entryPath: file.metadata.path,
        debug: debugRun,
        filter,
      });
    },
    [save, file.metadata.path, projectId, run, debugRun],
  );

  // The rail reports the last run, so the last run has to outlive this editor.
  useEffect(() => {
    if (state.status !== "done") return;
    if (lastRunWasFiltered.current) return;

    const projectRoot = findProjectOfFolder(fs, projectId);
    if (!projectRoot) return;

    const contract = contractOfProject(
      fs.listFilesRecursive(projectRoot),
    )?.contract;
    fs.status.recordTests(projectRoot, file.metadata.id, {
      sourceModified: file.metadata.lastModified,
      contractModified: contract?.lastModified ?? 0,
      // `counts` is already kept by the reducer; re-deriving it from `rows`
      // would be a second definition of the same number. A timeout is a
      // failure the user needs to see as one.
      passed: state.counts.passed,
      failed: state.counts.failed + state.counts.timedout,
    });
  }, [
    state.status,
    state.counts,
    fs,
    projectId,
    file.metadata.id,
    file.metadata.lastModified,
  ]);

  const runSingleTest = useCallback(
    (path: string[]) => {
      runFile(path).catch((e) =>
        toast.error("Could not run test: " + (e as Error).message),
      );
    },
    [runFile],
  );

  // The hooks below read refs that onMount fills. Setting editorReady there
  // re-renders, at which point those refs are non-null and the effects re-run
  // on a genuine dependency change.
  useTestDecorations(
    editorRef.current,
    monacoRef.current,
    state.rows,
    foundTests,
    runSingleTest,
  );

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
   * Re-runs the active test on its own, then simulates the scenario it
   * recorded.
   *
   * Running first is what makes the recording per-test: the runner captures
   * one recording per entry file, so a whole-file run yields every test's
   * transactions concatenated — which is rarely what you want to step through.
   *
   * It navigates rather than swapping itself out. The debugger used to appear
   * in place behind a boolean, which is why the back button could not return
   * here — the same fault `3933bb1` fixed for the SmartC editor. The recording
   * travels in the history entry, so going back and forward both work.
   */
  const simulateActiveTest = useCallback(async () => {
    const row = state.rows.find((candidate) => candidate.id === activeTestId);
    if (!row) return;

    const finished = await runFile(row.path);
    const fresh = finished?.recordings?.[file.metadata.path];

    if (!fresh?.contractSource) {
      toast.error(
        `"${row.name}" loaded no contract, so there is nothing to simulate.`,
      );
      return;
    }

    navigate(`/projects/${projectId}/simulate`, {
      state: {
        replay: {
          source: fresh.contractSource,
          scenario: serializeScenario(toDebugScenario(fresh)),
          testName: row.name,
          returnTo: `/projects/${projectId}/files/${file.metadata.id}`,
        },
      },
    });
  }, [state.rows, activeTestId, runFile, navigate, projectId, file.metadata]);

  return (
    <div className="min-h-0 flex-1">
      <ResizablePanelGroup direction="horizontal" className="h-full">
        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="flex h-full flex-col">
            <SurfaceToolbar
              verbs={
                <>
                  <ToolbarButton
                    weight="primary"
                    onClick={() => {
                      runFile().catch((e) =>
                        toast.error(
                          "Could not run tests: " + (e as Error).message,
                        ),
                      );
                    }}
                    disabled={isRunning}
                    title="Run this test file"
                  >
                    <Play className="h-4 w-4" />
                    Run
                  </ToolbarButton>
                  {/* Two words, two things, and they used to be one. Simulate
                      replays what the test *sent*, as a scenario, in the
                      simulator. Debug — the checkbox beside the results — is
                      debugging the test itself, in the browser's own tools. */}
                  <ToolbarButton
                    onClick={() => {
                      simulateActiveTest().catch((e) =>
                        toast.error(
                          "Could not simulate: " + (e as Error).message,
                        ),
                      );
                    }}
                    disabled={isRunning || !activeTestId}
                    title={
                      activeTestId
                        ? "Run the selected test and simulate the scenario it records"
                        : "Select a test to simulate its scenario"
                    }
                  >
                    <StepForward className="h-4 w-4" />
                    Simulate
                  </ToolbarButton>
                </>
              }
              context={
                isRunning ? (
                  <span className="motion-pulse text-xs text-[var(--accent-3)]">
                    running…
                  </span>
                ) : null
              }
              readout={
                <EditorFileActions
                  isDirty={isDirty}
                  onSave={saveNow}
                  onDownload={download}
                />
              }
            />
            {activeRow && (
              <div className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
                showing values from:{" "}
                {activeRow.path.length
                  ? activeRow.path.join(" › ")
                  : activeRow.name}
                {activeRow.traceTruncated &&
                  " — trace truncated, some values were not recorded"}
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
                — runs in the page so DevTools can break; a runaway contract
                will freeze the tab
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
