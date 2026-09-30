import type { LedgerState } from "../engine/engine.types";
import { Section } from "./debug-primitives";
import { t } from "@/i18n/runtime";

export function LedgerView({ ledger }: { ledger: LedgerState | null }) {
  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          {t("simulator.ledger.title", { block: ledger?.currentBlock ?? 0 })}
        </span>
      </div>
      <div className="flex-1 overflow-auto">
        {!ledger && <div className="p-3 opacity-50">{t("simulator.ledger.noLedger")}</div>}
        {ledger && (
          <>
            <Section label={t("simulator.ledger.accounts")} count={ledger.accounts.length}>
              {ledger.accounts.length === 0 ? (
                <div className="opacity-50 font-mono text-[11px]">{t("simulator.panels.none")}</div>
              ) : (
                <table className="w-full border-collapse text-[11px] font-mono">
                  <tbody>
                    {ledger.accounts.map((a, i) => (
                      <tr key={a.id} className={i % 2 ? "bg-muted/40" : ""}>
                        <td className="px-1.5 py-0.5">{a.id}</td>
                        <td className="px-1.5 py-0.5 text-right">{a.balance}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">
                          {a.tokens.map((token) => `${token.asset}×${token.quantity}`).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
            <Section label={t("simulator.ledger.transactions")} count={ledger.transactions.length}>
              {ledger.transactions.length === 0 ? (
                <div className="opacity-50 font-mono text-[11px]">{t("simulator.panels.none")}</div>
              ) : (
                <div className="font-mono text-[11px] space-y-0.5">
                  {ledger.transactions.map((tx, i) => (
                    <div key={i}>
                      {/* i18n-ignore — ledger notation */}
                      #{tx.block} · tx {tx.txId} · {tx.sender} → {tx.recipient} : {tx.amount}
                      {tx.message ? ` · "${tx.message}"` : ""}
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
