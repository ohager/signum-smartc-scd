import { formatValue } from "@/features/inspector/model/decode";
import { t } from "@/i18n/runtime";
import type { PreviewRow } from "../deploy-params";

/**
 * Exactly what the deployment will send, slot by slot. The data is
 * contiguous, so slots that are not parameters are shown too — dimmed, with
 * the value they will start with.
 */
export function DataStackPreview({ rows, prefix }: { rows: PreviewRow[]; prefix: "S" | "TS" }) {
  if (rows.length === 0) return null;
  const ctx = { prefix, enums: {} };
  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium">{t("asm-editor.params.preview")}</h4>
      <div className="overflow-x-auto">
        <table className="w-full text-xs font-mono">
          <thead className="text-muted-foreground">
            <tr className="text-left">
              <th className="py-1 pr-3 font-normal">{t("asm-editor.params.slot")}</th>
              <th className="py-1 pr-3 font-normal">{t("asm-editor.params.name")}</th>
              <th className="py-1 pr-3 font-normal">{t("asm-editor.params.value")}</th>
              <th className="py-1 font-normal">{t("asm-editor.params.hex")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.index} className={row.kind === "param" ? "" : "text-muted-foreground opacity-70"}>
                <td className="py-0.5 pr-3">{row.index}</td>
                <td className="py-0.5 pr-3">
                  {row.name ?? ""}
                  {row.kind === "internal" && <span className="ml-1 italic">({t("asm-editor.params.internal")})</span>}
                </td>
                <td className="py-0.5 pr-3">{formatValue(row.raw, "long", ctx)}</td>
                <td className="py-0.5">{formatValue(row.raw, "hex", ctx)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
