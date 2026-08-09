import type { DebugState } from "../engine/engine.types";
import { Pill } from "./debug-primitives";

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
}

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
}: Props) {
  const status = state?.status ?? "ready";
  const done = status === "finished" || status === "error";
  return (
    <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onContinue} disabled={done}>
        ▶ Continue
      </button>
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onStepInto} disabled={done}>
        Step Into
      </button>
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onStep} disabled={done}>
        Step (asm)
      </button>
      <button
        className="px-2 py-0.5 border rounded"
        onClick={onForgeNextBlock}
        title="Forge the next block and deliver its scheduled transactions"
      >
        ⛏ Next Block
      </button>
      <button className="px-2 py-0.5 border rounded" onClick={onReset}>
        Reset
      </button>
      <span className="mx-1 inline-flex rounded border overflow-hidden">
        <button
          className={"px-2 py-0.5 " + (viewMode === "source" ? "bg-blue-500/30" : "")}
          onClick={() => onViewMode("source")}
        >
          source
        </button>
        <button
          className={"px-2 py-0.5 border-l " + (viewMode === "asm" ? "bg-blue-500/30" : "")}
          onClick={() => onViewMode("asm")}
        >
          asm
        </button>
      </span>
      {onPopOut && (
        <button
          className="px-2 py-0.5 border rounded"
          onClick={onPopOut}
          title="Open a live debug dashboard in a separate browser tab"
        >
          ⧉ Pop out
        </button>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        <Pill>block {state?.currentBlock ?? 0}</Pill>
        <Pill tone={status === "error" ? "error" : status === "running" ? "accent" : "default"}>{status}</Pill>
        <Pill>step {state?.steps ?? 0}</Pill>
        {state?.currentSourceLine != null && <Pill>line {state.currentSourceLine}</Pill>}
        {state?.error && <Pill tone="error">{state.error}</Pill>}
      </span>
      <button className="px-2 py-0.5 border rounded" onClick={onClose}>
        ✕ Close
      </button>
    </div>
  );
}
