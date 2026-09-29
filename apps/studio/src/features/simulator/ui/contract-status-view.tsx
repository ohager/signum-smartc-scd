import type { DebugState } from "../engine/engine.types";
import { isInternalVar } from "./vars";
import { Section, KVTable } from "./debug-primitives";
import { t } from "@/i18n/runtime";

/** Read-only stacked contract state for the popped-out dashboard. */
export function ContractStatusView({ state }: { state: DebugState | null }) {
  const vars = Object.entries(state?.memory ?? {}).filter(([n]) => !isInternalVar(n));
  const regs = Object.entries(state?.registers ?? {});
  const bps = state?.breakpoints ?? [];
  const txs = state?.emittedTx ?? [];
  return (
    <div className="h-full overflow-auto">
      <Section label={t("simulator.panels.variables")} count={vars.length}>
        <KVTable rows={vars.map(([k, v]) => ({ k, v }))} />
      </Section>
      <Section label={t("simulator.panels.registers")} count={regs.length}>
        <KVTable rows={regs.map(([k, v]) => ({ k, v }))} />
      </Section>
      <Section label={t("simulator.panels.breakpoints")} count={bps.length}>
        {bps.length === 0 ? (
          <div className="opacity-50 text-xs font-mono">{t("simulator.panels.none")}</div>
        ) : (
          <div className="font-mono text-[11px]">{bps.map((l) => t("simulator.panels.line", { line: l })).join(", ")}</div>
        )}
      </Section>
      <Section label={t("simulator.panels.emittedTxs")} count={txs.length}>
        <KVTable rows={txs.map((tx) => ({ k: `→ ${tx.recipient}${tx.message ? ` "${tx.message}"` : ""}`, v: tx.amount }))} />
      </Section>
    </div>
  );
}
