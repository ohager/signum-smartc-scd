import type { DebugState } from "../engine/engine.types";
import { isInternalVar } from "./vars";
import { Section, KVTable } from "./debug-primitives";

/** Read-only stacked contract state for the popped-out dashboard. */
export function ContractStatusView({ state }: { state: DebugState | null }) {
  const vars = Object.entries(state?.memory ?? {}).filter(([n]) => !isInternalVar(n));
  const regs = Object.entries(state?.registers ?? {});
  const bps = state?.breakpoints ?? [];
  const txs = state?.emittedTx ?? [];
  return (
    <div className="h-full overflow-auto">
      <Section label="Variables" count={vars.length}>
        <KVTable rows={vars.map(([k, v]) => ({ k, v }))} />
      </Section>
      <Section label="Registers" count={regs.length}>
        <KVTable rows={regs.map(([k, v]) => ({ k, v }))} />
      </Section>
      <Section label="Breakpoints" count={bps.length}>
        {bps.length === 0 ? (
          <div className="opacity-50 text-xs font-mono">— none —</div>
        ) : (
          <div className="font-mono text-[11px]">{bps.map((l) => `line ${l}`).join(", ")}</div>
        )}
      </Section>
      <Section label="Emitted Txs" count={txs.length}>
        <KVTable rows={txs.map((t) => ({ k: `→ ${t.recipient}${t.message ? ` "${t.message}"` : ""}`, v: t.amount }))} />
      </Section>
    </div>
  );
}
