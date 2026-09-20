import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { toast } from "sonner";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import {
  SMARTC_LANGUAGE_ID,
  registerSmartC,
} from "@/features/smartc-editor/language/register.ts";
import { DebugController } from "../debug-controller";
import { ScSimulatorEngine } from "../engine/simulator-engine";
import { parseScenario, defaultScenario } from "../scenario/scenario-io";
import type { DebugState, LedgerState } from "../engine/engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";
import { DebugToolbar } from "./debug-toolbar";
import { DebugSidePanel } from "./debug-side-panel";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { createDebugHost, type DebugHost } from "../debug-broadcast";
import { useDebugDecorations } from "./use-debug-decorations";
import { AsmView } from "./asm-view";
import { SimulatorInvitation } from "./simulator-help";
import {
  setDebugMemory,
  clearDebugMemory,
} from "@/features/smartc-editor/language/debug-memory";

export interface ScenarioEntry {
  name: string;
  json: string;
}

interface Props {
  source: string;
  scenarios: ScenarioEntry[];
  /**
   * Where this session's input came from. There are two kinds — a scenario
   * file, and a recording of a test run — and they look identical while
   * behaving differently: the recording replays a transaction stream and does
   * not re-evaluate assertions. So each says which it is.
   */
  sourceLabel?: string;
  onClose: () => void;
  /** Absent when the page cannot create files for this project. */
  onNewScenario?: () => void;
}

/**
 * Debug view with a scenario picker. Selecting a different scenario remounts the
 * inner session (via `key`) so it re-compiles/re-runs against the chosen one.
 */
export function DebugView({
  source,
  scenarios,
  sourceLabel,
  onClose,
  onNewScenario,
}: Props) {
  const [selectedName, setSelectedName] = useState<string>(
    scenarios[0]?.name ?? "",
  );
  // Only ever set by the invitation's second button, and only while there is
  // nothing to pick.
  const [useDefault, setUseDefault] = useState(false);

  const scenario: ScenarioFile = useMemo(() => {
    const entry = scenarios.find((s) => s.name === selectedName);
    if (!entry) return defaultScenario();
    try {
      return parseScenario(entry.json);
    } catch (e: any) {
      toast.error("Invalid scenario, using built-in default: " + e.message);
      return defaultScenario();
    }
  }, [scenarios, selectedName]);

  if (scenarios.length === 0 && !useDefault) {
    return (
      <SimulatorInvitation
        onCreate={onNewScenario}
        onUseDefault={() => setUseDefault(true)}
      />
    );
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 min-h-0">
        <DebugSession
          key={selectedName || "__default__"}
          source={source}
          scenario={scenario}
          scenarios={scenarios}
          selectedName={selectedName}
          onSelectScenario={setSelectedName}
          onNewScenario={onNewScenario}
          sourceLabel={sourceLabel}
          onClose={onClose}
        />
      </div>
    </div>
  );
}

function DebugSession({
  source,
  scenario,
  scenarios,
  selectedName,
  onSelectScenario,
  onNewScenario,
  sourceLabel,
  onClose,
}: {
  source: string;
  scenario: ScenarioFile;
  scenarios: ScenarioEntry[];
  selectedName: string;
  onSelectScenario: (name: string) => void;
  onNewScenario?: () => void;
  sourceLabel?: string;
  onClose: () => void;
}) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const controllerRef = useRef<DebugController | null>(null);
  const debugHostRef = useRef<DebugHost | null>(null);
  const modelUriRef = useRef<string | null>(null);
  const [state, setState] = useState<DebugState | null>(null);
  const [ledger, setLedger] = useState<LedgerState | null>(null);
  const [viewMode, setViewMode] = useState<"source" | "asm">("source");
  const [assembly, setAssembly] = useState("");
  const monacoTheme = useMonacoTheme();

  // Publish live memory for the hover provider; clear on unmount.
  useEffect(() => {
    if (modelUriRef.current && state)
      setDebugMemory(modelUriRef.current, state.memory);
  }, [state]);
  useEffect(() => {
    return () => {
      if (modelUriRef.current) clearDebugMemory(modelUriRef.current);
    };
  }, []);

  // Cross-tab debug host: created once, closed on unmount.
  useEffect(() => {
    debugHostRef.current = createDebugHost();
    return () => debugHostRef.current?.close();
  }, []);
  // Mirror the current snapshot to any popped-out dashboard whenever it changes.
  useEffect(() => {
    if (state && ledger) debugHostRef.current?.publish({ state, ledger });
  }, [state, ledger]);

  const canPopOut = typeof BroadcastChannel !== "undefined";
  const onPopOut = () => window.open("/debug/dashboard", "smartc-debug");

  const onMount: OnMount = (editor, monaco) => {
    registerSmartC(monaco);
    // @ts-ignore
    editorRef.current = editor;
    monacoRef.current = monaco;
    modelUriRef.current = editor.getModel()?.uri.toString() ?? null;
    try {
      const controller = new DebugController(new ScSimulatorEngine());
      controllerRef.current = controller;
      setState(controller.start(source, scenario));
      setLedger(controller.getLedger());
      setAssembly(controller.getAssembly());
    } catch (e: any) {
      controllerRef.current = null;
      toast.error("Cannot start debug: " + e.message);
    }
    editor.onMouseDown((e) => {
      if (
        e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        const line = e.target.position?.lineNumber;
        if (line && controllerRef.current)
          setState(controllerRef.current.toggleBreakpoint(line));
      }
    });
  };

  useDebugDecorations(
    editorRef.current,
    monacoRef.current,
    state?.currentSourceLine ?? null,
    state?.breakpoints ?? [],
  );

  const run = (fn: () => DebugState) => () => {
    if (controllerRef.current) setState(fn());
  };

  const onForgeNextBlock = () => {
    if (controllerRef.current) {
      setState(controllerRef.current.forgeNextBlock());
      setLedger(controllerRef.current.getLedger());
    }
  };

  const onReset = () => {
    if (controllerRef.current) {
      setState(controllerRef.current.reset());
      setLedger(controllerRef.current.getLedger());
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <DebugToolbar
        state={state}
        onStep={run(() => controllerRef.current!.step())}
        onStepInto={run(() => controllerRef.current!.stepInto())}
        onContinue={run(() => controllerRef.current!.continue())}
        onForgeNextBlock={onForgeNextBlock}
        onReset={onReset}
        onPopOut={canPopOut ? onPopOut : undefined}
        viewMode={viewMode}
        onViewMode={setViewMode}
        scenarios={scenarios}
        selectedName={selectedName}
        onSelectScenario={onSelectScenario}
        onNewScenario={onNewScenario}
        sourceLabel={sourceLabel}
        onClose={onClose}
      />
      <ResizablePanelGroup direction="horizontal" className="min-h-0 flex-1">
        <ResizablePanel defaultSize={66} minSize={30}>
          <div className={viewMode === "asm" ? "hidden" : "h-full"}>
            <Editor
              height="100%"
              defaultLanguage={SMARTC_LANGUAGE_ID}
              value={source}
              theme={monacoTheme}
              options={{
                readOnly: true,
                minimap: { enabled: false },
                glyphMargin: true,
                fontSize: 14,
                automaticLayout: true,
                scrollBeyondLastLine: false,
              }}
              onMount={onMount}
            />
          </div>
          {viewMode === "asm" && (
            <AsmView
              assembly={assembly}
              currentAsmLine={state?.instructionPointer ?? 0}
            />
          )}
        </ResizablePanel>
        <ResizableHandle withHandle />
        <ResizablePanel defaultSize={34} minSize={20}>
          <div className="h-full overflow-hidden border-l">
            <DebugSidePanel
              state={state}
              ledger={ledger}
              onRemoveBreakpoint={(line) => {
                if (controllerRef.current)
                  setState(controllerRef.current.toggleBreakpoint(line));
              }}
            />
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
