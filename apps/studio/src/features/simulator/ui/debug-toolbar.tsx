import type { DebugState } from "../engine/engine.types";

interface Props {
  state: DebugState | null;
  onStep: () => void;
  onStepInto: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function DebugToolbar({ state, onStep, onStepInto, onReset, onClose }: Props) {
  const status = state?.status ?? "ready";
  const done = status === "finished" || status === "error";
  return (
    <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onStepInto} disabled={done}>
        Step Into
      </button>
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onStep} disabled={done}>
        Step (asm)
      </button>
      <button className="px-2 py-0.5 border rounded" onClick={onReset}>Reset</button>
      <span className="ml-auto opacity-70">
        {status} · step {state?.steps ?? 0} · line {state?.currentSourceLine ?? "—"}
      </span>
      <button className="px-2 py-0.5 border rounded" onClick={onClose}>✕ Close</button>
    </div>
  );
}
