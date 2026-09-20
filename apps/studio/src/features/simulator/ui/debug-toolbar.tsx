import type { DebugState } from "../engine/engine.types";
import type { ScenarioEntry } from "./debug-view";
import {
  SurfaceToolbar,
  ToolbarButton,
  ToolbarDivider,
  ToolbarIconButton,
  ToolbarReadout,
} from "@/components/ui/surface-toolbar.tsx";
import { SimulatorHelp } from "./simulator-help";

interface Props {
  state: DebugState | null;
  onStep: () => void;
  onStepInto: () => void;
  onContinue: () => void;
  onForgeNextBlock: () => void;
  onReset: () => void;
  onClose: () => void;
  onPopOut?: () => void;
  viewMode: "source" | "asm";
  onViewMode: (mode: "source" | "asm") => void;
  scenarios: ScenarioEntry[];
  selectedName: string;
  onSelectScenario: (name: string) => void;
  onNewScenario?: () => void;
  /**
   * Which kind of input this session is reading. There are two — a scenario
   * file and a recording of a test run — and they look identical while
   * behaving differently, so the readout names it.
   */
  sourceLabel?: string;
}

/**
 * The transport, at the size of the thing that gets pressed most.
 *
 * It also absorbed the scenario strip that used to sit above it, so the
 * simulator spends one 44px row where it spent two of 30px — with buttons
 * twice the size.
 *
 * The step vocabulary is the other half of the untangling. `stepInto()`
 * advances a source line and `step()` advances one AT instruction
 * (`engine/simulator-engine.ts`), and they used to be labelled "Step Into" and
 * "Step (asm)": two granularities under nearly the same name.
 */
export function DebugToolbar({
  state,
  onStep,
  onStepInto,
  onContinue,
  onForgeNextBlock,
  onReset,
  onClose,
  onPopOut,
  viewMode,
  onViewMode,
  scenarios,
  selectedName,
  onSelectScenario,
  onNewScenario,
  sourceLabel,
}: Props) {
  const status = state?.status ?? "ready";
  const done = status === "finished" || status === "error";

  return (
    <SurfaceToolbar
      verbs={
        <>
          <ToolbarButton weight="primary" onClick={onContinue} disabled={done}>
            ▶ Continue
          </ToolbarButton>
          {/* The source-line step — the one usually wanted, so it carries the
              plain name. */}
          <ToolbarButton
            onClick={onStepInto}
            disabled={done}
            title="Advance one source line"
          >
            Step
          </ToolbarButton>
          {/* One AT instruction. That is the asm view's granularity, so it is
              offered where that granularity is on screen and nowhere else. */}
          {viewMode === "asm" && (
            <ToolbarButton
              onClick={onStep}
              disabled={done}
              title="Advance one AT instruction"
            >
              Step instruction
            </ToolbarButton>
          )}
          <ToolbarDivider />
          {/* Moves the chain, not the contract — hence its own group. */}
          <ToolbarButton
            onClick={onForgeNextBlock}
            title="Forge the next block and deliver its scheduled transactions"
          >
            ⛏ Next block
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={onReset} title="Start this scenario over">
            ⟳ Reset
          </ToolbarButton>
        </>
      }
      context={
        <>
          <select
            aria-label="Scenario"
            className="max-w-[220px] border border-[var(--border-1)] bg-transparent px-2 py-1 font-mono text-[11px]"
            value={selectedName}
            onChange={(e) => onSelectScenario(e.target.value)}
          >
            {scenarios.length === 0 && (
              <option value="">(built-in default)</option>
            )}
            {scenarios.map((scenario) => (
              <option key={scenario.name} value={scenario.name}>
                {scenario.name}
              </option>
            ))}
          </select>
          {onNewScenario && (
            <ToolbarButton
              onClick={onNewScenario}
              title="Create a run scenario for this contract"
            >
              + New
            </ToolbarButton>
          )}
          <span className="inline-flex border border-[var(--border-2)] text-xs">
            {(["source", "asm"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={
                  "px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] " +
                  (mode === "asm" ? "border-l border-[var(--border-2)] " : "") +
                  (viewMode === mode
                    ? "bg-[color-mix(in_srgb,var(--accent-1)_28%,transparent)]"
                    : "opacity-70 hover:opacity-100")
                }
              >
                {mode}
              </button>
            ))}
          </span>
          <SimulatorHelp />
        </>
      }
      readout={
        <>
          <ToolbarReadout
            items={[
              ...(sourceLabel ? [{ label: "", value: sourceLabel }] : []),
              { label: "block", value: String(state?.currentBlock ?? 0) },
              {
                label: "",
                value: status,
                tone:
                  status === "error"
                    ? "bad"
                    : status === "running"
                      ? "good"
                      : undefined,
              },
              { label: "step", value: String(state?.steps ?? 0) },
              ...(state?.currentSourceLine != null
                ? [{ label: "line", value: String(state.currentSourceLine) }]
                : []),
            ]}
          />
          {state?.error && (
            <span
              className="max-w-[240px] truncate text-xs text-[var(--mag)]"
              title={state.error}
            >
              {state.error}
            </span>
          )}
          {onPopOut && (
            <ToolbarIconButton
              label="Open a live debug dashboard in a separate tab"
              onClick={onPopOut}
            >
              ⧉
            </ToolbarIconButton>
          )}
          <ToolbarIconButton label="Close the simulator" onClick={onClose}>
            ✕
          </ToolbarIconButton>
        </>
      }
    />
  );
}
