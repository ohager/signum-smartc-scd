import { useEffect, useState } from "react";
import type { LedgerState } from "@/features/simulator/engine/engine.types";
import { subscribeLedger } from "@/features/simulator/ledger-broadcast";
import { LedgerView } from "@/features/simulator/ui/ledger-view";

export function LedgerLivePage() {
  const [ledger, setLedger] = useState<LedgerState | null>(null);
  useEffect(() => subscribeLedger(setLedger), []);
  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs shrink-0">
        <span className="font-medium">⛓ SmartC Ledger</span>
        <span className={ledger ? "text-green-600" : "opacity-50"}>
          {ledger ? "● live" : "waiting for a debug session…"}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <LedgerView ledger={ledger} />
      </div>
    </div>
  );
}
