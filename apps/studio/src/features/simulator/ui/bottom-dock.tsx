import { useState } from "react";
import type { DebugState } from "../engine/engine.types";

type Tab = "console" | "txs";

export function BottomDock({ state }: { state: DebugState | null }) {
  const [tab, setTab] = useState<Tab>("console");
  const tabs: { id: Tab; label: string }[] = [
    { id: "console", label: "Console" },
    { id: "txs", label: `Emitted Txs (${state?.emittedTx.length ?? 0})` },
  ];
  return (
    <div className="h-[150px] shrink-0 border-t flex flex-col text-xs">
      <div className="flex border-b shrink-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={"px-3 py-1 " + (tab === t.id ? "bg-blue-500/20 font-medium" : "opacity-70")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono">
        {tab === "console" && (
          <>
            <div>
              status: {state?.status ?? "ready"} · step {state?.steps ?? 0} · block {state?.currentBlock ?? 0}
            </div>
            {state?.error && <div className="text-red-500">error: {state.error}</div>}
          </>
        )}
        {tab === "txs" && (
          <>
            {(state?.emittedTx ?? []).length === 0 && <div className="opacity-50">— none —</div>}
            {(state?.emittedTx ?? []).map((tx, i) => (
              <div key={i}>
                → {tx.recipient} : {tx.amount}
                {tx.message ? ` · "${tx.message}"` : ""}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
