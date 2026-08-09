import { useState } from "react";
import type { DebugState, LedgerState } from "../engine/engine.types";
import { InspectorPanel } from "./inspector-panel";
import { LedgerView } from "./ledger-view";

type View = "contract" | "ledger";

export function DebugSidePanel({
  state,
  ledger,
  onRemoveBreakpoint,
}: {
  state: DebugState | null;
  ledger: LedgerState | null;
  onRemoveBreakpoint: (line: number) => void;
}) {
  const [view, setView] = useState<View>("contract");
  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex border-b shrink-0">
        {(["contract", "ledger"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={"flex-1 px-2 py-1 " + (view === v ? "bg-blue-500/20 font-medium" : "opacity-70")}
          >
            {v === "contract" ? "Contract Status" : "Ledger Status"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {view === "contract" ? (
          <InspectorPanel state={state} onRemoveBreakpoint={onRemoveBreakpoint} />
        ) : (
          <LedgerView ledger={ledger} />
        )}
      </div>
    </div>
  );
}
