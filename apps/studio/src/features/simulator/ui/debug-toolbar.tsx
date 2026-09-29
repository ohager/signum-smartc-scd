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
import { transportFor } from "./transport";
import { t } from "@/i18n/runtime";

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
  /** Whether anything has moved the contract since this round began. */
  hasMoved: boolean;
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
  hasMoved,
}: Props) {
  const status = state?.status ?? "ready";
  const transport = transportFor(status, hasMoved);

  return (
    <SurfaceToolbar
      verbs={
        <>
          <ToolbarButton
            weight={transport.emphasise === "run" ? "primary" : "secondary"}
            onClick={onContinue}
            disabled={transport.runDisabled}
            title={transport.note || undefined}
          >
            ▶ {transport.runLabel === "Start" ? t("simulator.toolbar.start") : t("simulator.toolbar.continue")}
          </ToolbarButton>
          {/* The source-line step — the one usually wanted, so it carries the
              plain name. */}
          <ToolbarButton
            onClick={onStepInto}
            disabled={!transport.canStep}
            title={transport.note || t("simulator.toolbar.stepHint")}
          >
            {t("simulator.toolbar.step")}
          </ToolbarButton>
          {/* One AT instruction. That is the asm view's granularity, so it is
              offered where that granularity is on screen and nowhere else. */}
          {viewMode === "asm" && (
            <ToolbarButton
              onClick={onStep}
              disabled={!transport.canStep}
              title={transport.note || t("simulator.toolbar.stepInstructionHint")}
            >
              {t("simulator.toolbar.stepInstruction")}
            </ToolbarButton>
          )}
          <ToolbarDivider />
          {/* Moves the chain, not the contract — hence its own group. */}
          {/* Takes the weight the run button gives up when a round ends: it is
              the only way onwards from there, and used to sit quietly beside
              two disabled buttons saying nothing. */}
          <ToolbarButton
            weight={transport.emphasise === "forge" ? "primary" : "secondary"}
            onClick={onForgeNextBlock}
            title={t("simulator.toolbar.nextBlockHint")}
          >
            {t("simulator.toolbar.nextBlock")}
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={onReset} title={t("simulator.toolbar.resetHint")}>
            {t("simulator.toolbar.reset")}
          </ToolbarButton>
        </>
      }
      context={
        <>
          <select
            aria-label={t("simulator.toolbar.scenario")}
            className="max-w-[220px] border border-[var(--border-1)] bg-transparent px-2 py-1 font-mono text-[11px]"
            value={selectedName}
            onChange={(e) => onSelectScenario(e.target.value)}
          >
            {scenarios.length === 0 && (
              <option value="">{t("simulator.toolbar.builtInDefault")}</option>
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
              title={t("simulator.toolbar.newScenarioHint")}
            >
              {t("simulator.toolbar.newScenario")}
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
              { label: t("simulator.toolbar.block"), value: String(state?.currentBlock ?? 0) },
              {
                label: "",
                value: t(`simulator.status.${status}`),
                tone:
                  status === "error"
                    ? "bad"
                    : status === "running"
                      ? "good"
                      : undefined,
              },
              { label: t("simulator.toolbar.stepCount"), value: String(state?.steps ?? 0) },
              ...(state?.currentSourceLine != null
                ? [{ label: t("simulator.toolbar.line"), value: String(state.currentSourceLine) }]
                : []),
            ]}
          />
          {transport.note && !state?.error && (
            <span
              className="max-w-[280px] truncate text-xs text-[var(--dim)]"
              title={transport.note}
            >
              {transport.note}
            </span>
          )}
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
              label={t("simulator.toolbar.popOut")}
              onClick={onPopOut}
            >
              ⧉
            </ToolbarIconButton>
          )}
          <ToolbarIconButton label={t("simulator.toolbar.close")} onClick={onClose}>
            ✕
          </ToolbarIconButton>
        </>
      }
    />
  );
}
