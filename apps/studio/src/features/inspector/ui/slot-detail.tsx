import { Button } from "@/components/ui/button";
import { KVTable } from "@/features/simulator/ui/debug-primitives";
import { t } from "@/i18n/runtime";
import { allInterpretations, slotToBigInt } from "../model/decode";
import type { SlotRow } from "../model/data-stack";
import type { Trust } from "../disasm/trust";
import { TrustBadge } from "./trust-badge";

export function SlotDetail({
  row,
  prefix,
  onLabel,
  use,
  trust,
  onShowInCode,
}: {
  row: SlotRow;
  prefix: "S" | "TS";
  onLabel: () => void;
  /** How many instructions read and write this slot; null when the code is not available. */
  use: { reads: number; writes: number } | null;
  trust: Trust | null;
  onShowInCode: () => void;
}) {
  const interpretations = row.hex ? allInterpretations(slotToBigInt(row.hex), prefix) : [];
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">
          #{row.index} {row.name ?? ""} {trust && <TrustBadge trust={trust} />}
        </span>
        <Button size="sm" variant="outline" onClick={onLabel}>
          {row.label ? t("inspector.data.editLabel") : t("inspector.data.setLabel")}
        </Button>
      </div>
      {row.label?.comment && <p className="text-muted-foreground">{row.label.comment}</p>}
      {use && (
        <div className="flex items-center justify-between gap-2">
          <span>{t("inspector.data.use", { reads: use.reads, writes: use.writes })}</span>
          <Button size="sm" variant="ghost" onClick={onShowInCode}>
            {t("inspector.data.showInCode")}
          </Button>
        </div>
      )}
      <h4 className="text-xs font-semibold uppercase text-muted-foreground">{t("inspector.data.interpretations")}</h4>
      <KVTable
        rows={interpretations.map((i) => ({
          k: i.kind === "stringReversed" ? t("inspector.data.stringReversed") : i.kind,
          v: i.value,
        }))}
      />
    </div>
  );
}
