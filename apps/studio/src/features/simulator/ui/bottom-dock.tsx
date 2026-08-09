import { useState } from "react";
import type { DebugState, LedgerState } from "../engine/engine.types";

type Tab = "ledger" | "console" | "txs" | "balance";

export function BottomDock({ state, ledger }: { state: DebugState | null; ledger: LedgerState | null }) {
  const [tab, setTab] = useState<Tab>("ledger");
  const tabs: { id: Tab; label: string }[] = [
    { id: "ledger", label: `Ledger${ledger ? ` · block ${ledger.currentBlock}` : ""}` },
    { id: "console", label: "Console" },
    { id: "txs", label: `Emitted Txs (${state?.emittedTx.length ?? 0})` },
    { id: "balance", label: "Balance" },
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
        {tab === "ledger" && <LedgerView ledger={ledger} />}
        {tab === "console" && (
          <>
            <div>
              status: {state?.status ?? "ready"} · step {state?.steps ?? 0}
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
        {tab === "balance" && <div>contract balance: {state?.balance ?? "0"}</div>}
      </div>
    </div>
  );
}

function LedgerView({ ledger }: { ledger: LedgerState | null }) {
  if (!ledger) return <div className="opacity-50">— no ledger —</div>;
  return (
    <div className="flex gap-6">
      <div className="min-w-[240px]">
        <div className="font-medium mb-1">Accounts · block {ledger.currentBlock}</div>
        {ledger.accounts.length === 0 && <div className="opacity-50">— none —</div>}
        <table className="border-collapse">
          <tbody>
            {ledger.accounts.map((a) => (
              <tr key={a.id}>
                <td className="pr-3">{a.id}</td>
                <td className="pr-3 text-right">{a.balance}</td>
                <td className="opacity-70">{a.tokens.map((t) => `${t.asset}×${t.quantity}`).join(", ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="min-w-[280px]">
        <div className="font-medium mb-1">Transactions</div>
        {ledger.transactions.length === 0 && <div className="opacity-50">— none —</div>}
        {ledger.transactions.map((t, i) => (
          <div key={i}>
            #{t.block} · tx {t.txId} · {t.sender} → {t.recipient} : {t.amount}
            {t.message ? ` · "${t.message}"` : ""}
          </div>
        ))}
      </div>
    </div>
  );
}
