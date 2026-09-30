import { Button } from "@/components/ui/button";
import { KVTable } from "@/features/simulator/ui/debug-primitives";
import { t } from "@/i18n/runtime";
import { allInterpretations, slotToBigInt } from "../model/decode";
import type { SlotRow } from "../model/data-stack";

export function SlotDetail({ row, prefix, onLabel }: { row: SlotRow; prefix: "S" | "TS"; onLabel: () => void }) {
  const interpretations = row.hex ? allInterpretations(slotToBigInt(row.hex), prefix) : [];
  return (
    <div className="flex flex-col gap-3 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono">
          #{row.index} {row.name ?? ""}
        </span>
        <Button size="sm" variant="outline" onClick={onLabel}>
          {row.label ? t("inspector.data.editLabel") : t("inspector.data.setLabel")}
        </Button>
      </div>
      {row.label?.comment && <p className="text-muted-foreground">{row.label.comment}</p>}
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
