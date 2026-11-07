import { AlertTriangle, Info } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatValue } from "@/features/inspector/model/decode";
import { t } from "@/i18n/runtime";
import type { FieldState } from "../deploy-params";
import type { Overwrite } from "../overwritten-params";

/** Deploy is possible once every field encodes and every known overwrite is acknowledged. */
export function parametersReady(fields: FieldState[], overwrites: Overwrite[], confirmed: Set<number>): boolean {
  return fields.every((f) => !f.error) && overwrites.every((o) => confirmed.has(o.index));
}

interface ParameterFormProps {
  fields: FieldState[];
  enums: Record<string, Record<string, string>>;
  prefix: "S" | "TS";
  values: Record<number, string>;
  onChange: (index: number, value: string) => void;
  overwrites: Overwrite[];
  confirmed: Set<number>;
  onConfirm: (index: number, yes: boolean) => void;
  /** False in the inspector: there is no source to scan for overwrites. */
  sourceKnown: boolean;
}

export function ParameterForm({
  fields,
  enums,
  prefix,
  values,
  onChange,
  overwrites,
  confirmed,
  onConfirm,
  sourceKnown,
}: ParameterFormProps) {
  if (fields.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("asm-editor.params.none")}</p>;
  }
  const overwriteOf = new Map(overwrites.map((o) => [o.index, o]));

  return (
    <div className="space-y-4">
      {!sourceKnown && (
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          {t("asm-editor.params.noSourceCheck")}
        </p>
      )}
      {fields.map(({ slot, raw, error }) => {
        const id = `param-${slot.index}`;
        const format = slot.format ?? "long";
        const ctx = { prefix, enums, enumName: slot.enum };
        const value = values[slot.index] ?? "";
        const overwrite = overwriteOf.get(slot.index);
        const entries = slot.enum ? Object.entries(enums[slot.enum] ?? {}) : [];
        return (
          <div key={slot.index} className="space-y-1.5">
            <Label htmlFor={id} className="flex items-baseline gap-2">
              <span>{slot.name}</span>
              <span className="font-mono text-xs text-muted-foreground">
                #{slot.index} · {format}
              </span>
            </Label>
            {slot.comment && <p className="text-xs text-muted-foreground">{slot.comment}</p>}
            {format === "enum" || format === "bool" ? (
              <Select value={value} onValueChange={(v) => onChange(slot.index, v)}>
                <SelectTrigger id={id} className="w-full">
                  <SelectValue placeholder={formatValue(raw, format, ctx)} />
                </SelectTrigger>
                <SelectContent>
                  {format === "bool"
                    ? ["false", "true"].map((b) => (
                        <SelectItem key={b} value={b}>
                          {b}
                        </SelectItem>
                      ))
                    : entries.map(([key, label]) => (
                        <SelectItem key={key} value={key}>
                          {label} ({key})
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id={id}
                value={value}
                onChange={(e) => onChange(slot.index, e.target.value)}
                placeholder={t("asm-editor.params.placeholderDefault", { value: formatValue(raw, format, ctx) })}
                aria-invalid={error ? true : undefined}
                className="font-mono"
              />
            )}
            {error && <p className="text-xs text-[var(--mag)]">{t(`asm-editor.params.error.${error}`)}</p>}
            {overwrite && (
              <div className="space-y-1.5 text-xs">
                <p className="flex items-center gap-1.5 text-amber-600 dark:text-amber-400">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {t("asm-editor.params.overwritten", { line: overwrite.line })}
                </p>
                <label className="flex items-center gap-2">
                  <Checkbox
                    checked={confirmed.has(slot.index)}
                    onCheckedChange={(c) => onConfirm(slot.index, c === true)}
                  />
                  {t("asm-editor.params.confirmOverwrite")}
                </label>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
