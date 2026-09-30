import type { Contract } from "@signumjs/contracts";
import { Button } from "@/components/ui/button";
import { Amount } from "@/components/ui/amount";
import { KVTable } from "@/features/simulator/ui/debug-primitives";
import { t } from "@/i18n/runtime";
import { contractStatus } from "../chain/inspector-client";
import type { IndexedLabelMap, Resolution } from "../model/resolve-label-map";
import { statusLabel } from "./watchlist-panel";

export function OverviewTab({
  contract,
  resolution,
  labelMaps,
  onPin,
  onCreate,
  onAddHash,
}: {
  contract: Contract;
  resolution: Resolution;
  labelMaps: IndexedLabelMap[];
  onPin: (entry: IndexedLabelMap) => void;
  onCreate: () => void;
  onAddHash: (entry: IndexedLabelMap) => void;
}) {
  const rows = [
    { k: t("inspector.overview.id"), v: `${contract.atRS} (${contract.at})` },
    { k: t("inspector.overview.name"), v: contract.name },
    { k: t("inspector.overview.description"), v: contract.description || "—" },
    { k: t("inspector.overview.creator"), v: `${contract.creatorRS} (${contract.creator})` },
    { k: t("inspector.overview.status"), v: statusLabel(contractStatus(contract)) },
    { k: t("inspector.overview.codeHash"), v: contract.machineCodeHashId },
    { k: t("inspector.overview.creationBlock"), v: String(contract.creationBlock) },
  ];
  const valid = labelMaps.filter((m) => m.map);

  return (
    <div className="flex flex-col gap-4 p-4 text-sm">
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">{t("inspector.overview.balance")}</span>
        <Amount amount={contract.balanceNQT} isAtomic />
        <span className="text-muted-foreground">{t("inspector.overview.minActivation")}</span>
        <Amount amount={contract.minActivation} isAtomic />
      </div>
      <KVTable rows={rows} />

      <section className="flex flex-col gap-2">
        <h3 className="font-semibold">{t("inspector.overview.labelMap")}</h3>
        {resolution.pinnedMissing && (
          <p className="text-[var(--amber)]">
            {t("inspector.overview.pinnedMissing", { name: resolution.pinnedMissing })}
          </p>
        )}
        {(resolution.kind === "pinned" || resolution.kind === "hash") && (
          <p>
            {resolution.entry.name}{" "}
            <span className="text-muted-foreground">
              ({resolution.kind === "pinned" ? t("inspector.overview.resolvedByPin") : t("inspector.overview.resolvedByHash")})
            </span>
          </p>
        )}
        {resolution.kind === "ambiguous" && (
          <div className="flex flex-col gap-1">
            <p>{t("inspector.overview.ambiguous")}</p>
            {resolution.candidates.map((c) => (
              <div key={c.fileId} className="flex items-center gap-2">
                <span className="font-mono text-xs">{c.path}</span>
                <Button size="sm" variant="outline" onClick={() => onPin(c)}>
                  {t("inspector.overview.choose")}
                </Button>
              </div>
            ))}
          </div>
        )}
        {resolution.kind === "none" && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground">{t("inspector.overview.none")}</span>
            <Button size="sm" onClick={onCreate}>
              {t("inspector.overview.create")}
            </Button>
            {valid.length > 0 && (
              <select
                className="rounded border bg-transparent px-2 py-1 text-xs"
                defaultValue=""
                onChange={(e) => {
                  const target = valid.find((m) => m.fileId === e.target.value);
                  if (target) onAddHash(target);
                }}
              >
                <option value="" disabled>
                  {t("inspector.overview.addHash")}
                </option>
                {valid.map((m) => (
                  <option key={m.fileId} value={m.fileId}>
                    {m.path}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
