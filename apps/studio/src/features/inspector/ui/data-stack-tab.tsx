import { useMemo, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { cn } from "@/lib/utils";
import { ROW_HOVER, ROW_SELECTED } from "./selection";
import { t } from "@/i18n/runtime";
import { buildSlotRows, slotCount, type SlotRow } from "../model/data-stack";
import { removeSlot, upsertSlot } from "../model/label-map-edits";
import type { SlotLabel } from "../model/label-map";
import type { IndexedLabelMap } from "../model/resolve-label-map";
import { updateFileText } from "../workspace/update-file";
import { SlotDetail } from "./slot-detail";
import { SlotLabelDialog } from "./slot-label-dialog";

export function DataStackTab({
  contract,
  labelMap,
  prefix,
  ensureLabelMap,
}: {
  contract: Contract;
  labelMap: IndexedLabelMap | null;
  prefix: "S" | "TS";
  ensureLabelMap: () => Promise<string | null>;
}) {
  const fs = useFileSystem();
  const rows = useMemo(
    () => buildSlotRows(contract.machineData, labelMap?.map ?? null, prefix),
    [contract.machineData, labelMap, prefix],
  );
  const [onlyLabelled, setOnlyLabelled] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [editing, setEditing] = useState<SlotLabel | null>(null);

  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (!onlyLabelled || r.label) &&
      (!q || String(r.index) === q || r.name?.toLowerCase().includes(q) || r.value?.toLowerCase().includes(q)),
  );
  const current: SlotRow | undefined = rows.find((r) => r.index === selected);

  const writeLabel = async (edit: (text: string) => string) => {
    const fileId = labelMap?.fileId ?? (await ensureLabelMap());
    if (!fileId) return;
    try {
      await updateFileText(fs, fileId, edit);
      toast.success(t("inspector.data.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-center gap-3 border-b px-4 py-2 text-xs">
          <span className="text-muted-foreground">
            {t("inspector.data.length", { bytes: contract.machineData.length / 2, slots: slotCount(contract.machineData) })}
          </span>
          <label className="flex items-center gap-1">
            <Checkbox checked={onlyLabelled} onCheckedChange={(v) => setOnlyLabelled(v === true)} />
            {t("inspector.data.onlyLabelled")}
          </label>
          <Input
            className="h-7 max-w-64"
            placeholder={t("inspector.data.search")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-background text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-1 text-right">{t("inspector.data.index")}</th>
                <th className="px-2 py-1 text-left">{t("inspector.data.name")}</th>
                <th className="px-2 py-1 text-left">{t("inspector.data.value")}</th>
                <th className="px-2 py-1 text-left">{t("inspector.data.raw")}</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((row) => (
                <tr
                  key={`${row.index}-${row.outOfRange}`}
                  onClick={() => setSelected(row.index)}
                  className={cn("cursor-pointer", ROW_HOVER, selected === row.index && ROW_SELECTED)}
                >
                  <td className="px-4 py-0.5 text-right font-mono text-muted-foreground">{row.index}</td>
                  <td className="px-2 py-0.5">{row.name ?? ""}</td>
                  <td className="px-2 py-0.5 font-mono">
                    {row.outOfRange ? (
                      <span className="text-[var(--amber)]">{t("inspector.data.outOfRange")}</span>
                    ) : (
                      row.value
                    )}
                  </td>
                  <td className="px-2 py-0.5 font-mono text-xs text-muted-foreground">{row.hex ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <aside className="w-80 shrink-0 overflow-auto border-l">
        {current ? (
          <SlotDetail
            row={current}
            prefix={prefix}
            onLabel={() => setEditing(current.label ?? { index: current.index, name: "" })}
          />
        ) : (
          <p className="p-3 text-xs text-muted-foreground">{t("inspector.data.select")}</p>
        )}
      </aside>
      {editing && (
        <SlotLabelDialog
          open
          onOpenChange={(open) => !open && setEditing(null)}
          initial={editing}
          enums={Object.keys(labelMap?.map?.enums ?? {})}
          onSave={(slot) => void writeLabel((text) => upsertSlot(text, slot))}
          onRemove={editing.name ? () => void writeLabel((text) => removeSlot(text, editing.index)) : undefined}
        />
      )}
    </div>
  );
}
