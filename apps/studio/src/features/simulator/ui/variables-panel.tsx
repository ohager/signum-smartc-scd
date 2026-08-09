import type { DebugState } from "../engine/engine.types";

export function VariablesPanel({ state }: { state: DebugState | null }) {
  const entries = Object.entries(state?.memory ?? {});
  return (
    <div className="p-2 text-xs font-mono">
      <div className="uppercase opacity-60 mb-1">Variables</div>
      {entries.length === 0 && <div className="opacity-50">— step to inspect —</div>}
      {entries.map(([name, value]) => (
        <div key={name} className="flex justify-between gap-4">
          <span>{name}</span>
          <span className="opacity-80">{value}</span>
        </div>
      ))}
    </div>
  );
}
