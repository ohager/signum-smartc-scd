import Editor, { type OnMount } from "@monaco-editor/react";
import { useMemo, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { SMARTC_LANGUAGE_ID, registerSmartC } from "@/features/smartc-editor/language/register.ts";
import { DebugController } from "../debug-controller";
import { ScSimulatorEngine } from "../engine/simulator-engine";
import { parseScenario, defaultScenario } from "../scenario/scenario-io";
import type { DebugState } from "../engine/engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";
import { DebugToolbar } from "./debug-toolbar";
import { VariablesPanel } from "./variables-panel";
import { useDebugDecorations } from "./use-debug-decorations";

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
  const [state, setState] = useState<DebugState | null>(null);
  const { theme } = useTheme();

  const onMount: OnMount = (editor, monaco) => {
    registerSmartC(monaco);
    editorRef.current = editor;
    monacoRef.current = monaco;
    try {
      const controller = new DebugController(new ScSimulatorEngine());
      controllerRef.current = controller;
      setState(controller.start(source, scenario));
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
        if (line && controllerRef.current) setState(controllerRef.current.toggleBreakpoint(line));
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

  return (
    <div className="flex flex-col h-full">
      <DebugToolbar
        state={state}
        onStep={run(() => controllerRef.current!.step())}
        onStepInto={run(() => controllerRef.current!.stepInto())}
        onContinue={run(() => controllerRef.current!.continue())}
        onReset={run(() => controllerRef.current!.reset())}
        onClose={onClose}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 min-w-0">
          <Editor
            height="100%"
            defaultLanguage={SMARTC_LANGUAGE_ID}
            value={source}
            theme={theme === "dark" ? "vs-dark" : "light"}
            options={{ readOnly: true, minimap: { enabled: false }, glyphMargin: true, fontSize: 14, automaticLayout: true }}
            onMount={onMount}
          />
        </div>
        <div className="w-[240px] border-l overflow-auto">
          <VariablesPanel state={state} />
        </div>
      </div>
    </div>
  );
}
