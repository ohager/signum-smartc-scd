import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useMemo, useRef, useState } from "react";
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

interface Props {
  source: string;
  scenarioJson?: string;
  onClose: () => void;
}

export function DebugView({ source, scenarioJson, onClose }: Props) {
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const controllerRef = useRef<DebugController | null>(null);
  const [state, setState] = useState<DebugState | null>(null);
  const { theme } = useTheme();

  const scenario: ScenarioFile = useMemo(() => {
    try {
      return scenarioJson ? parseScenario(scenarioJson) : defaultScenario();
    } catch (e: any) {
      toast.error("Invalid scenario, using default: " + e.message);
      return defaultScenario();
    }
  }, [scenarioJson]);

  const startSession = useCallback(() => {
    try {
      const controller = new DebugController(new ScSimulatorEngine());
      controllerRef.current = controller;
      setState(controller.start(source, scenario));
    } catch (e: any) {
      controllerRef.current = null;
      toast.error("Cannot start debug: " + e.message);
    }
  }, [source, scenario]);

  const onMount: OnMount = (editor, monaco) => {
    registerSmartC(monaco);
    editorRef.current = editor;
    monacoRef.current = monaco;
    startSession();
  };

  useDebugDecorations(editorRef.current, monacoRef.current, state?.currentSourceLine ?? null);

  const run = (fn: () => DebugState) => () => {
    if (controllerRef.current) setState(fn());
  };

  return (
    <div className="flex flex-col h-full">
      <DebugToolbar
        state={state}
        onStep={run(() => controllerRef.current!.step())}
        onStepInto={run(() => controllerRef.current!.stepInto())}
        onReset={run(() => controllerRef.current!.reset())}
        onClose={onClose}
      />
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1">
          <Editor
            height="100%"
            defaultLanguage={SMARTC_LANGUAGE_ID}
            value={source}
            theme={theme === "dark" ? "vs-dark" : "light"}
            options={{ readOnly: true, minimap: { enabled: false }, glyphMargin: true, fontSize: 14 }}
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
