import type { LedgerState } from "../engine/engine.types";

/**
 * Vertical, reusable ledger view (committed chain state). Shows a pop-out button
 * only when `onPopOut` is provided (i.e. inside the debugger, not on the popped page).
 */
export function LedgerView({ ledger, onPopOut }: { ledger: LedgerState | null; onPopOut?: () => void }) {
  return (
    <div className="flex flex-col h-full text-xs font-mono">
      <div className="flex items-center justify-between px-2 py-1 border-b shrink-0">
        <span className="font-medium">Ledger · block {ledger?.currentBlock ?? 0}</span>
        {onPopOut && (
          <button
            className="border rounded px-2 py-0.5 font-sans"
            onClick={onPopOut}
            title="Open the ledger in a separate, live-updating browser tab"
          >
            ⧉ pop out
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {!ledger && <div className="opacity-50">— no ledger —</div>}
        {ledger && (
          <>
            <div className="mb-1 opacity-60 uppercase tracking-wide text-[10px]">Accounts</div>
            {ledger.accounts.length === 0 && <div className="opacity-50">— none —</div>}
            <table className="border-collapse mb-3">
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
            <div className="mb-1 opacity-60 uppercase tracking-wide text-[10px]">Transactions</div>
            {ledger.transactions.length === 0 && <div className="opacity-50">— none —</div>}
            {ledger.transactions.map((t, i) => (
              <div key={i}>
                #{t.block} · tx {t.txId} · {t.sender} → {t.recipient} : {t.amount}
                {t.message ? ` · "${t.message}"` : ""}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
