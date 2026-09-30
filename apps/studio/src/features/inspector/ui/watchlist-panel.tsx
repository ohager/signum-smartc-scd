import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { ROW_HOVER, ROW_SELECTED } from "./selection";
import { t } from "@/i18n/runtime";
import type { ContractStatus } from "../chain/inspector-client";
import { networkKey, type Network } from "../model/networks";
import type { WatchEntry } from "../model/watchlist";

/** Spelled out, so every key stays visible to the typed `t` and the i18n scanner. */
export function statusLabel(status: ContractStatus): string {
  switch (status) {
    case "running":
      return t("inspector.status.running");
    case "stopped":
      return t("inspector.status.stopped");
    case "finished":
      return t("inspector.status.finished");
    case "frozen":
      return t("inspector.status.frozen");
    case "dead":
      return t("inspector.status.dead");
  }
}

export function networkLabel(network: Network): string {
  if (network === "mainnet") return t("inspector.network.mainnet");
  if (network === "testnet") return t("inspector.network.testnet");
  return new URL(network.node).host;
}

export const entryKey = (e: WatchEntry) => `${e.id}@${networkKey(e.network)}`;

export function WatchlistPanel({
  entries,
  selected,
  onSelect,
  onAdd,
  onRemove,
}: {
  entries: WatchEntry[];
  selected: string | null;
  onSelect: (key: string) => void;
  onAdd: () => void;
  onRemove: (entry: WatchEntry) => void;
}) {
  return (
    <aside className="flex w-64 shrink-0 flex-col border-r">
      <div className="flex items-center justify-between border-b p-2">
        <Button size="sm" variant="outline" onClick={onAdd}>
          <Plus className="h-4 w-4" /> {t("inspector.editor.add")}
        </Button>
      </div>
      {entries.length === 0 ? (
        <p className="p-3 text-xs text-muted-foreground">{t("inspector.editor.empty")}</p>
      ) : (
        <ul className="min-h-0 flex-1 overflow-auto">
          {entries.map((entry) => {
            const key = entryKey(entry);
            return (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => onSelect(key)}
                  className={cn(
                    "group flex w-full items-center gap-2 px-3 py-2 text-left text-sm",
                    ROW_HOVER,
                    selected === key && ROW_SELECTED,
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{entry.alias ?? entry.id}</span>
                    {entry.alias && (
                      <span className="block truncate font-mono text-xs text-muted-foreground">{entry.id}</span>
                    )}
                  </span>
                  <Badge variant="outline">{networkLabel(entry.network)}</Badge>
                  <span
                    role="button"
                    tabIndex={0}
                    title={t("inspector.editor.remove")}
                    className="invisible text-muted-foreground group-hover:visible"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(entry);
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );
}
