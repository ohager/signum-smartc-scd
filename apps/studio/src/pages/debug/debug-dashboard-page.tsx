import { useEffect, useState } from "react";
import { subscribeDebug, type DebugSnapshot } from "@/features/simulator/debug-broadcast";
import { ContractStatusView } from "@/features/simulator/ui/contract-status-view";
import { LedgerView } from "@/features/simulator/ui/ledger-view";
import { Pill } from "@/features/simulator/ui/debug-primitives";
import { t } from "@/i18n/runtime";

export function DebugDashboardPage() {
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);
  useEffect(() => subscribeDebug(setSnap), []);
  const s = snap?.state;
  const status = s?.status ?? "ready";
  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 h-9 px-3 border-b bg-card shrink-0">
        {/* i18n-ignore — product name */}
        <span className="font-bold tracking-wide">⛓ SmartC Debug</span>
        {s && <Pill tone={status === "error" ? "error" : status === "running" ? "accent" : "default"}>{status}</Pill>}
        {s && <Pill>{t("common.debugDashboard.block", { block: s.currentBlock })}</Pill>}
        {s && <Pill>{t("common.debugDashboard.step", { step: s.steps })}</Pill>}
        {s?.error && <Pill tone="error">{s.error}</Pill>}
        <span className={"ml-auto text-xs font-semibold " + (snap ? "text-[var(--green)]" : "opacity-50")}>
          {snap ? t("common.debugDashboard.live") : t("common.debugDashboard.waiting")}
        </span>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 border-r flex flex-col">
          <div className="px-3 py-1.5 border-b bg-card text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            {t("common.debugDashboard.contractStatus")}
          </div>
          <div className="flex-1 min-h-0">
            <ContractStatusView state={snap?.state ?? null} />
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-3 py-1.5 border-b bg-card text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            {t("common.debugDashboard.ledgerStatus")}
          </div>
          <div className="flex-1 min-h-0">
            <LedgerView ledger={snap?.ledger ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}
