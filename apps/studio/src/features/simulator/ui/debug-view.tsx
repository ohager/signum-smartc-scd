import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { SMARTC_LANGUAGE_ID, registerSmartC } from "@/features/smartc-editor/language/register.ts";
import { DebugController } from "../debug-controller";
import { ScSimulatorEngine } from "../engine/simulator-engine";
import { parseScenario, defaultScenario } from "../scenario/scenario-io";
import type { DebugState, LedgerState } from "../engine/engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";
import { DebugToolbar } from "./debug-toolbar";
import { DebugSidePanel } from "./debug-side-panel";
import { createLedgerHost, type LedgerHost } from "../ledger-broadcast";
import { useDebugDecorations } from "./use-debug-decorations";
import { AsmView } from "./asm-view";
import { BottomDock } from "./bottom-dock";

const DOCK_HEIGHT = 150;
import { setDebugMemory, clearDebugMemory } from "@/features/smartc-editor/language/debug-memory";

export interface ScenarioEntry {
  name: string;
  json: string;
}

interface Props {
  source: string;
  scenarios: ScenarioEntry[];
  onClose: () => void;
}

/**
 * Debug view with a scenario picker. Selecting a different scenario remounts the
 * inner session (via `key`) so it re-compiles/re-runs against the chosen one.
 */
export function DebugView({ source, scenarios, onClose }: Props) {
  const [selectedName, setSelectedName] = useState<string>(scenarios[0]?.name ?? "");

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

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
        <span className="opacity-70">Scenario:</span>
        <select
          className="bg-transparent border rounded px-1 py-0.5 max-w-[240px]"
          value={selectedName}
          onChange={(e) => setSelectedName(e.target.value)}
        >
          {scenarios.length === 0 && <option value="">(built-in default)</option>}
          {scenarios.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        {scenarios.length === 0 && (
          <span className="opacity-50">— create one with “New Scenario” on the contract</span>
        )}
      </div>
      <div className="flex-1 min-h-0">
        <DebugSession key={selectedName || "__default__"} source={source} scenario={scenario} onClose={onClose} />
      </div>
    </div>
  );
}

function DebugSession({
  source,
  scenario,
  onClose,
}: {
  source: string;
  scenario: ScenarioFile;
  onClose: () => void;
}) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const controllerRef = useRef<DebugController | null>(null);
  const ledgerHostRef = useRef<LedgerHost | null>(null);
  const modelUriRef = useRef<string | null>(null);
  const [state, setState] = useState<DebugState | null>(null);
  const [ledger, setLedger] = useState<LedgerState | null>(null);
  const [viewMode, setViewMode] = useState<"source" | "asm">("source");
  const [assembly, setAssembly] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const [editorHeight, setEditorHeight] = useState("calc(100vh)"); // Initial height
  const { theme } = useTheme();

  // Resizable right inspector panel (drag handle mutates width live, commits on release).
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState<string>(
    () => (typeof window !== "undefined" && localStorage.getItem("debug-panel-width")) || "320px",
  );
  useEffect(() => {
    localStorage.setItem("debug-panel-width", panelWidth);
  }, [panelWidth]);
  const onPanelResize = (e: React.MouseEvent) => {
    e.preventDefault();
    let latest = panelWidth;
    let frame = 0;
    const onMove = (ev: MouseEvent) => {
      const w = Math.min(Math.max(window.innerWidth - ev.clientX, 220), 680);
      latest = `${w}px`;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (panelRef.current) panelRef.current.style.width = latest;
      });
    };
    const onUp = () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      if (frame) cancelAnimationFrame(frame);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setPanelWidth(latest);
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

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

  // Cross-tab ledger host: created once, closed on unmount.
  useEffect(() => {
    ledgerHostRef.current = createLedgerHost();
    return () => ledgerHostRef.current?.close();
  }, []);
  // Mirror the current ledger to any popped-out tab whenever it changes.
  useEffect(() => {
    if (ledger) ledgerHostRef.current?.publish(ledger);
  }, [ledger]);

  const canPopOut = typeof BroadcastChannel !== "undefined";
  const onPopOut = () => window.open("/debug/ledger", "smartc-ledger");

  useEffect(() => {
    const calculateEditorHeight = () => {
      if (containerRef.current) {
        const containerTop = containerRef.current.getBoundingClientRect().top;
        // subtract the 30px toolbar and the bottom dock so nothing overflows
        const newHeight = `calc(100vh - ${containerTop + 30 + DOCK_HEIGHT}px)`;
        setEditorHeight(newHeight);
      }
    };

    calculateEditorHeight();
    window.addEventListener("resize", calculateEditorHeight);

    return () => {
      window.removeEventListener("resize", calculateEditorHeight);
    };
  }, []);

  const onMount: OnMount = (editor, monaco) => {
    registerSmartC(monaco);
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
    <div className="flex flex-col h-full" ref={containerRef}>
      <DebugToolbar
        state={state}
        onStep={run(() => controllerRef.current!.step())}
        onStepInto={run(() => controllerRef.current!.stepInto())}
        onContinue={run(() => controllerRef.current!.continue())}
        onForgeNextBlock={onForgeNextBlock}
        onReset={onReset}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onClose={onClose}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 min-w-0">
          <div className={viewMode === "asm" ? "hidden" : ""}>
            <Editor
              height={editorHeight}
              defaultLanguage={SMARTC_LANGUAGE_ID}
              value={source}
              theme={theme === "dark" ? "vs-dark" : "light"}
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
              height={editorHeight}
            />
          )}
        </div>
        <div
          onMouseDown={onPanelResize}
          role="separator"
          aria-orientation="vertical"
          title="Drag to resize"
          className="w-1.5 shrink-0 cursor-col-resize hover:bg-blue-500/40"
        />
        <div ref={panelRef} style={{ width: panelWidth }} className="shrink-0 border-l overflow-hidden">
          <DebugSidePanel
            state={state}
            ledger={ledger}
            onRemoveBreakpoint={(line) => {
              if (controllerRef.current) setState(controllerRef.current.toggleBreakpoint(line));
            }}
            onPopOut={canPopOut ? onPopOut : undefined}
          />
        </div>
      </div>
      <BottomDock state={state} />
    </div>
  );
}
