import type { LedgerState } from "../engine/engine.types";
import { Section } from "./debug-primitives";

export function LedgerView({ ledger, onPopOut }: { ledger: LedgerState | null; onPopOut?: () => void }) {
  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Ledger · block {ledger?.currentBlock ?? 0}
        </span>
        {onPopOut && (
          <button
            className="border rounded px-2 py-0.5 font-sans"
            onClick={onPopOut}
            title="Open the live debug dashboard in a separate browser tab"
          >
            ⧉ pop out
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {!ledger && <div className="p-3 opacity-50">— no ledger —</div>}
        {ledger && (
          <>
            <Section label="Accounts" count={ledger.accounts.length}>
              {ledger.accounts.length === 0 ? (
                <div className="opacity-50 font-mono text-[11px]">— none —</div>
              ) : (
                <table className="w-full border-collapse text-[11px] font-mono">
                  <tbody>
                    {ledger.accounts.map((a, i) => (
                      <tr key={a.id} className={i % 2 ? "bg-muted/40" : ""}>
                        <td className="px-1.5 py-0.5">{a.id}</td>
                        <td className="px-1.5 py-0.5 text-right">{a.balance}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">
                          {a.tokens.map((t) => `${t.asset}×${t.quantity}`).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
            <Section label="Transactions" count={ledger.transactions.length}>
              {ledger.transactions.length === 0 ? (
                <div className="opacity-50 font-mono text-[11px]">— none —</div>
              ) : (
                <div className="font-mono text-[11px] space-y-0.5">
                  {ledger.transactions.map((t, i) => (
                    <div key={i}>
                      #{t.block} · tx {t.txId} · {t.sender} → {t.recipient} : {t.amount}
                      {t.message ? ` · "${t.message}"` : ""}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
