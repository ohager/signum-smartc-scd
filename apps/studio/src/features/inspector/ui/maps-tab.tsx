import { useEffect, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { ChevronDown, ChevronRight, Tag } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { t } from "@/i18n/runtime";
import type { InspectorClient } from "../chain/inspector-client";
import { decimalToBigInt, formatValue } from "../model/decode";
import { isFixedGroup, type MapGroup } from "../model/label-map";
import { upsertMapGroup } from "../model/label-map-edits";
import { formatKey2, parseKeyInput } from "../model/map-keys";
import type { IndexedLabelMap } from "../model/resolve-label-map";
import { updateFileText } from "../workspace/update-file";
import { MapGroupDialog } from "./map-group-dialog";

const PAGE = 100;

type Rows = { key2: string; value: string }[];

/** One key1 worth of entries, loaded when opened and paged on demand. */
function KeyValues({
  client,
  contractId,
  key1,
  group,
  ctx,
  valueFilter,
}: {
  client: InspectorClient;
  contractId: string;
  key1: string;
  group: MapGroup | null;
  ctx: { prefix: "S" | "TS"; enums: Record<string, Record<string, string>> };
  valueFilter?: string;
}) {
  const [rows, setRows] = useState<Rows | null>(null);
  const [page, setPage] = useState(0);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async (next: number) => {
    setBusy(true);
    try {
      const got = await client.getMapByKey1(contractId, key1, next, PAGE, valueFilter);
      setRows((r) => [...(next === 0 ? [] : (r ?? [])), ...got]);
      setPage(next);
      setMore(got.length === PAGE);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contractId, key1, valueFilter]);

  if (rows === null) return <p className="px-6 py-1 text-xs text-muted-foreground">{t("inspector.maps.loading")}</p>;
  if (rows.length === 0) return <p className="px-6 py-1 text-xs text-muted-foreground">{t("inspector.maps.empty")}</p>;

  return (
    <div className="px-6 pb-2">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>
            <th className="py-1 text-left">{t("inspector.maps.key2")}</th>
            <th className="py-1 text-left">{t("inspector.maps.value")}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = formatKey2(r.key2, group, ctx);
            const format = k.valueFormat ?? group?.valueFormat ?? "long";
            const enumName = k.enumName ?? group?.enum;
            return (
              <tr key={r.key2}>
                <td className="py-0.5 font-mono">
                  {k.name ? <span className="font-sans">{k.name} </span> : null}
                  <span className={k.name ? "text-xs text-muted-foreground" : ""}>{k.key}</span>
                </td>
                <td className="py-0.5 font-mono">{formatValue(decimalToBigInt(r.value), format, { ...ctx, enumName })}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {more && (
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => void load(page + 1)}>
          {t("inspector.maps.more")}
        </Button>
      )}
    </div>
  );
}

export function MapsTab({
  contract,
  client,
  labelMap,
  prefix,
  ensureLabelMap,
}: {
  contract: Contract;
  client: InspectorClient;
  labelMap: IndexedLabelMap | null;
  prefix: "S" | "TS";
  ensureLabelMap: () => Promise<string | null>;
}) {
  const fs = useFileSystem();
  const groups = labelMap?.map?.maps ?? [];
  const ctx = { prefix, enums: labelMap?.map?.enums ?? {} };
  const [open, setOpen] = useState<Record<string, string | null>>({});
  const [patternInput, setPatternInput] = useState<Record<number, string>>({});
  const [free, setFree] = useState({ key1: "", value: "", active: null as null | { key1: string; value?: string } });
  const [editing, setEditing] = useState<MapGroup | null>(null);

  const saveGroup = async (group: MapGroup) => {
    const fileId = labelMap?.fileId ?? (await ensureLabelMap());
    if (!fileId) return;
    try {
      await updateFileText(fs, fileId, (text) => upsertMapGroup(text, group));
      toast.success(t("inspector.maps.saved"));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <section>
        <h3 className="mb-2 text-sm font-semibold">{t("inspector.maps.groups")}</h3>
        {groups.length === 0 && <p className="text-xs text-muted-foreground">{t("inspector.maps.noGroups")}</p>}
        {groups.map((group, i) => {
          const id = String(i);
          const activeKey = open[id] ?? null;
          if (isFixedGroup(group)) {
            return (
              <div key={id} className="border-b">
                <button
                  type="button"
                  className="flex w-full items-center gap-2 py-1 text-left text-sm"
                  onClick={() => setOpen((o) => ({ ...o, [id]: activeKey ? null : group.key1 }))}
                >
                  {activeKey ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  {group.name} <span className="font-mono text-xs text-muted-foreground">key1 {group.key1}</span>
                </button>
                {activeKey && (
                  <KeyValues client={client} contractId={contract.at} key1={group.key1} group={group} ctx={ctx} />
                )}
              </div>
            );
          }
          const parsed = parseKeyInput(patternInput[i] ?? "", group.key1Format);
          return (
            <div key={id} className="border-b py-1">
              <div className="flex items-center gap-2 text-sm">
                <span>{group.name}</span>
                <Input
                  className="h-7 max-w-72"
                  placeholder={t("inspector.maps.key1For", { format: group.key1Format })}
                  value={patternInput[i] ?? ""}
                  onChange={(e) => setPatternInput((p) => ({ ...p, [i]: e.target.value }))}
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!parsed.ok}
                  onClick={() => parsed.ok && setOpen((o) => ({ ...o, [id]: parsed.key }))}
                >
                  {t("inspector.maps.load")}
                </Button>
              </div>
              {activeKey && (
                <KeyValues key={activeKey} client={client} contractId={contract.at} key1={activeKey} group={group} ctx={ctx} />
              )}
            </div>
          );
        })}
      </section>

      <section>
        <h3 className="mb-2 text-sm font-semibold">{t("inspector.maps.free")}</h3>
        <div className="flex items-center gap-2">
          <Input
            className="h-7 max-w-56"
            placeholder={t("inspector.maps.key1")}
            value={free.key1}
            onChange={(e) => setFree((f) => ({ ...f, key1: e.target.value }))}
          />
          <Input
            className="h-7 max-w-48"
            placeholder={t("inspector.maps.valueFilter")}
            value={free.value}
            onChange={(e) => setFree((f) => ({ ...f, value: e.target.value }))}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const key = parseKeyInput(free.key1, undefined);
              const value = free.value.trim() ? parseKeyInput(free.value, undefined) : null;
              if (!key.ok || (value && !value.ok)) {
                toast.error(t("inspector.maps.invalidKey"));
                return;
              }
              setFree((f) => ({ ...f, active: { key1: key.key, value: value?.ok ? value.key : undefined } }));
            }}
          >
            {t("inspector.maps.load")}
          </Button>
          {free.active && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setEditing({ key1: free.active!.key1, name: "" })}
            >
              <Tag className="h-4 w-4" /> {t("inspector.maps.labelGroup")}
            </Button>
          )}
        </div>
        {free.active && (
          <KeyValues
            key={`${free.active.key1}|${free.active.value ?? ""}`}
            client={client}
            contractId={contract.at}
            key1={free.active.key1}
            group={null}
            ctx={ctx}
            valueFilter={free.active.value}
          />
        )}
      </section>

      {editing && (
        <MapGroupDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          initial={editing}
          onSave={(g) => void saveGroup(g)}
        />
      )}
    </div>
  );
}
