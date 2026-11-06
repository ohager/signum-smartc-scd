import { Address } from "@signumjs/core";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n/runtime";
import type { ReferenceCandidate } from "../reference-search";

const rs = (id: string, prefix: "S" | "TS") => Address.fromNumericId(id, prefix).getReedSolomonAddress();

/** Which deployed original the new instance takes its code from. */
export function ReferencePicker({
  candidates,
  selected,
  onSelect,
  prefix,
}: {
  candidates: ReferenceCandidate[];
  selected: string | null;
  onSelect: (contractId: string) => void;
  prefix: "S" | "TS";
}) {
  return (
    <Select value={selected ?? undefined} onValueChange={onSelect}>
      <SelectTrigger className="w-full font-mono text-xs" aria-label={t("asm-editor.reference.original")}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {candidates.map((c) => (
          <SelectItem key={c.contractId} value={c.contractId} className="font-mono text-xs">
            {t("asm-editor.reference.candidate", {
              id: rs(c.contractId, prefix),
              creator: rs(c.creator, prefix),
              height: c.height,
            })}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
