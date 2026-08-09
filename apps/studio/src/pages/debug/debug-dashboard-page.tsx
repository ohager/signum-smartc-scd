import { useEffect, useState } from "react";
import { subscribeDebug, type DebugSnapshot } from "@/features/simulator/debug-broadcast";
import { ContractStatusView } from "@/features/simulator/ui/contract-status-view";
import { LedgerView } from "@/features/simulator/ui/ledger-view";
import { Pill } from "@/features/simulator/ui/debug-primitives";

export function DebugDashboardPage() {
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);
  useEffect(() => subscribeDebug(setSnap), []);
  const s = snap?.state;
  const status = s?.status ?? "ready";
  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 h-9 px-3 border-b bg-card shrink-0">
        <span className="font-bold tracking-wide">⛓ SmartC Debug</span>
        {s && <Pill tone={status === "error" ? "error" : status === "running" ? "accent" : "default"}>{status}</Pill>}
        {s && <Pill>block {s.currentBlock}</Pill>}
        {s && <Pill>step {s.steps}</Pill>}
        {s?.error && <Pill tone="error">{s.error}</Pill>}
        <span className={"ml-auto text-xs font-semibold " + (snap ? "text-green-600" : "opacity-50")}>
          {snap ? "● live" : "waiting for a debug session…"}
        </span>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 border-r flex flex-col">
          <div className="px-3 py-1.5 border-b bg-card text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            Contract Status
          </div>
          <div className="flex-1 min-h-0">
            <ContractStatusView state={snap?.state ?? null} />
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-3 py-1.5 border-b bg-card text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            Ledger Status
          </div>
          <div className="flex-1 min-h-0">
            <LedgerView ledger={snap?.ledger ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}
