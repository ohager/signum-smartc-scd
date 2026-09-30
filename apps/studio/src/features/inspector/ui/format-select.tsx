import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { t } from "@/i18n/runtime";
import { FORMATS, type ValueFormat } from "../model/formats";

const NONE = "__none"; // i18n-ignore

export function FormatSelect({
  value,
  onChange,
  allowEmpty = true,
  id,
}: {
  value: ValueFormat | undefined;
  onChange: (value: ValueFormat | undefined) => void;
  allowEmpty?: boolean;
  id?: string;
}) {
  return (
    <Select value={value ?? NONE} onValueChange={(v) => onChange(v === NONE ? undefined : (v as ValueFormat))}>
      <SelectTrigger id={id}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {allowEmpty && <SelectItem value={NONE}>{t("inspector.label.formatNone")}</SelectItem>}
        {FORMATS.map((f) => (
          <SelectItem key={f} value={f}>
            {f}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
