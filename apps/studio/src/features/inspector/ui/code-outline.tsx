import { cn } from "@/lib/utils";
import { t } from "@/i18n/runtime";
import type { EntryKind, Outline } from "../disasm/outline";
import type { Names } from "../disasm/names";
import { ROW_HOVER } from "./selection";
import type { LabelMap } from "../model/label-map";
import { targetTrust } from "../disasm/trust";
import { TrustBadge } from "./trust-badge";

export function kindLabel(kind: EntryKind): string {
  switch (kind) {
    case "start":
      return t("inspector.code.kinds.start");
    case "restart":
      return t("inspector.code.kinds.restart");
    case "error":
      return t("inspector.code.kinds.error");
    case "function":
      return t("inspector.code.kinds.function");
  }
}

export function CodeOutline({
  outline,
  names,
  onGo,
  map,
  codeHash,
}: {
  outline: Outline;
  names: Names;
  onGo: (address: number) => void;
  map: LabelMap | null;
  codeHash: string;
}) {
  return (
    <nav className="w-56 shrink-0 overflow-auto border-r p-2 text-sm" aria-label={t("inspector.code.outline")}>
      <h3 className="mb-1 px-1 text-xs font-semibold uppercase text-muted-foreground">{t("inspector.code.outline")}</h3>
      <ul>
        {outline.sections.map((s) => (
          <li key={s.address}>
            <button
              type="button"
              onClick={() => onGo(s.address)}
              className={cn("flex w-full flex-col items-start rounded px-1 py-1 text-left", ROW_HOVER)}
            >
              <span className="truncate font-mono">
                {names.targetDisplay.get(s.address) ?? kindLabel(s.kinds[0]!)}{" "}
                {(() => {
                  const trust = targetTrust(names, s.address, map, codeHash);
                  return trust && <TrustBadge trust={trust} />;
                })()}
              </span>
              <span className="text-xs text-muted-foreground">
                {/* An unnamed entry is already titled by its first kind; do not say it twice. */}
                {(names.targetDisplay.has(s.address) ? s.kinds : s.kinds.slice(1)).map(kindLabel).join(" · ")}
                {s.callers.length > 0 && ` · ${t("inspector.code.callers", { count: s.callers.length })}`}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
