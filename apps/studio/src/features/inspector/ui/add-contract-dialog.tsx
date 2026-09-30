import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { t } from "@/i18n/runtime";
import { createInspectorClient, filterSummaries, type ContractSummary } from "../chain/inspector-client";
import { createPagedSearch, type PagedSearch } from "../chain/paged-search";
import { parseContractId } from "../model/contract-input";
import { networkFromWallet, type Network } from "../model/networks";
import type { WatchEntry } from "../model/watchlist";
import { NetworkPicker } from "./network-picker";
import { statusLabel } from "./watchlist-panel";

const PAGE = 100;

/**
 * Three ways in: one contract, everything a creator deployed, or every
 * instance of a code hash. The last two can run to thousands — pages load on
 * request, the loaded rows filter locally, and "Stop" drops only the page in
 * flight.
 */
export function AddContractDialog({
  open,
  onOpenChange,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entries: WatchEntry[]) => void;
}) {
  const wallet = useWalletStatus();
  const [network, setNetwork] = useState<Network>(wallet ? networkFromWallet(wallet.network) : "testnet");
  const [tab, setTab] = useState<"id" | "creator" | "hash">("id");
  const [input, setInput] = useState("");
  const [hashFilter, setHashFilter] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [total, setTotal] = useState<number | null>(null);
  const [rows, setRows] = useState<ContractSummary[]>([]);
  const [done, setDone] = useState(true);
  const [filter, setFilter] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const search = useRef<PagedSearch<ContractSummary> | null>(null);
  const abort = useRef<AbortController | null>(null);

  const reset = () => {
    abort.current?.abort();
    search.current = null;
    setRows([]);
    setTotal(null);
    setDone(true);
    setPicked(new Set());
    setError("");
    setBusy(false);
  };
  useEffect(() => {
    if (!open) reset();
  }, [open]);
  useEffect(reset, [tab, network]);

  const client = useMemo(() => createInspectorClient(network), [JSON.stringify(network)]);

  const run = async (work: (signal: AbortSignal) => Promise<void>) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    setError("");
    try {
      await work(controller.signal);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (abort.current === controller) setBusy(false);
    }
  };

  const loadNext = () =>
    run(async (signal) => {
      await search.current!.loadNext(signal);
      setRows(search.current!.rows);
      setDone(search.current!.done);
    });

  const startSearch = () => {
    reset();
    const id = parseContractId(input);
    if (tab === "id") {
      if (!id) return setError(t("inspector.add.invalidId"));
      return run(async () => {
        try {
          await client.getContract(id);
        } catch (e) {
          if ((e as { kind?: string }).kind === "not-found") throw new Error(t("inspector.add.notFound", { id }));
          throw e;
        }
        onAdd([{ id, network }]);
        onOpenChange(false);
      });
    }
    if (tab === "creator") {
      if (!id) return setError(t("inspector.add.invalidId"));
      return run(async () => {
        const all = await client.listByCreator(id, { codeHash: hashFilter.trim() || undefined });
        setTotal(all.length);
        search.current = createPagedSearch(async (page) => all.slice(page * PAGE, (page + 1) * PAGE), PAGE, all.length);
        await search.current.loadNext(abort.current!.signal);
        setRows(search.current.rows);
        setDone(search.current.done);
      });
    }
    const hash = input.trim();
    if (!/^\d+$/.test(hash)) return setError(t("inspector.add.invalidId"));
    return run(async (signal) => {
      const count = await client.countByCodeHash(hash);
      setTotal(count);
      search.current = createPagedSearch((page) => client.listByCodeHash(hash, page, PAGE), PAGE, count);
      await search.current.loadNext(signal);
      setRows(search.current.rows);
      setDone(search.current.done);
    });
  };

  const shown = filterSummaries(rows, filter);
  const toggle = (id: string) =>
    setPicked((p) => {
      const next = new Set(p);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-[720px]">
        <DialogHeader>
          <DialogTitle>{t("inspector.add.title")}</DialogTitle>
        </DialogHeader>
        <Label>{t("inspector.add.network")}</Label>
        <NetworkPicker value={network} onChange={setNetwork} />
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="self-start">
            <TabsTrigger value="id">{t("inspector.add.tabs.id")}</TabsTrigger>
            <TabsTrigger value="creator">{t("inspector.add.tabs.creator")}</TabsTrigger>
            <TabsTrigger value="hash">{t("inspector.add.tabs.hash")}</TabsTrigger>
          </TabsList>
          <TabsContent value={tab} className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-end gap-2">
              <div className="flex flex-1 flex-col gap-1">
                <Label htmlFor="add-input">
                  {tab === "id"
                    ? t("inspector.add.idLabel")
                    : tab === "creator"
                      ? t("inspector.add.creatorLabel")
                      : t("inspector.add.hashLabel")}
                </Label>
                <Input
                  id="add-input"
                  autoFocus
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void startSearch()}
                />
              </div>
              {tab === "creator" && wallet && (
                <Button variant="outline" onClick={() => setInput(wallet.accountId)}>
                  {t("inspector.add.myWallet")}
                </Button>
              )}
              {busy ? (
                <Button variant="outline" onClick={() => abort.current?.abort()}>
                  {t("inspector.add.cancel")}
                </Button>
              ) : (
                <Button onClick={() => void startSearch()}>
                  {tab === "id" ? t("inspector.add.addOne") : t("inspector.add.search")}
                </Button>
              )}
            </div>
            {tab === "creator" && (
              <Input
                placeholder={t("inspector.add.hashFilter")}
                value={hashFilter}
                onChange={(e) => setHashFilter(e.target.value)}
              />
            )}
            {error && <p className="text-sm text-[var(--mag)]">{error}</p>}
            {tab !== "id" && total !== null && (
              <>
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-muted-foreground">
                    {t("inspector.add.found", { shown: rows.length, total })}
                  </span>
                  <Input
                    className="h-7 max-w-64"
                    placeholder={t("inspector.add.filter")}
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                  />
                  <Button size="sm" variant="ghost" onClick={() => setPicked(new Set(shown.map((r) => r.id)))}>
                    {t("inspector.add.selectAll")}
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-auto rounded border">
                  {shown.length === 0 && <p className="p-2 text-xs text-muted-foreground">{t("inspector.add.none")}</p>}
                  {shown.map((r) => (
                    <label key={r.id} className="flex items-center gap-2 border-b px-2 py-1 text-sm hover:bg-accent">
                      <Checkbox checked={picked.has(r.id)} onCheckedChange={() => toggle(r.id)} />
                      <span className="w-48 shrink-0 truncate font-mono text-xs">{r.id}</span>
                      <span className="min-w-0 flex-1 truncate">{r.name}</span>
                      <span className="text-xs text-muted-foreground">{statusLabel(r.status)}</span>
                    </label>
                  ))}
                  {!done && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => void loadNext()}>
                      {t("inspector.add.more")}
                    </Button>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        </Tabs>
        {tab !== "id" && (
          <DialogFooter>
            <Button
              disabled={picked.size === 0}
              onClick={() => {
                onAdd([...picked].map((id) => ({ id, network })));
                onOpenChange(false);
              }}
            >
              {t("inspector.add.addSelected", { count: picked.size })}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
