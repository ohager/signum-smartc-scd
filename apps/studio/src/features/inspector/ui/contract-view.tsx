import { useMemo, useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SurfaceToolbar, ToolbarButton, ToolbarDiagnostic } from "@/components/ui/surface-toolbar";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { t } from "@/i18n/runtime";
import { addressPrefixOf, networkKey, type Network } from "../model/networks";
import { NetworkPicker } from "./network-picker";
import { labelTarget, resolveLabelMap, type IndexedLabelMap } from "../model/resolve-label-map";
import type { WatchEntry } from "../model/watchlist";
import { useLabelMaps } from "../workspace/use-label-maps";
import { addHashToLabelMap, createLabelMapFor } from "./label-map-actions";
import { OverviewTab } from "./overview-tab";
import { DataStackTab } from "./data-stack-tab";
import { MapsTab } from "./maps-tab";
import { useContract } from "./use-contract";

/**
 * One contract: fetched from its node, labelled by whichever Label Map the
 * workspace resolves for its code hash. Everything below re-renders from the
 * files, so a label set anywhere shows here without a second copy of state.
 */
export function ContractView({
  entry,
  folderId,
  onPin,
  onMoveNetwork,
}: {
  entry: WatchEntry;
  folderId: string;
  onPin: (path: string) => void;
  /** Reads the same contract through another node — the way out when a node is down. */
  onMoveNetwork: (to: Network) => void;
}) {
  const fs = useFileSystem();
  const labelMaps = useLabelMaps();
  const { state, contract, error, refresh, client, revision } = useContract(entry);
  const resolution = useMemo(
    () => resolveLabelMap(contract?.machineCodeHashId ?? "", entry.labelMap, labelMaps),
    [contract?.machineCodeHashId, entry.labelMap, labelMaps],
  );
  const active: IndexedLabelMap | null =
    resolution.kind === "pinned" || resolution.kind === "hash" ? resolution.entry : null;
  const prefix = addressPrefixOf(entry.network);
  const network = networkKey(entry.network);

  const createMap = async (): Promise<string | null> => {
    if (!contract) return null;
    try {
      const id = await createLabelMapFor(fs, folderId, entry.alias ?? contract.name, contract.machineCodeHashId, network);
      toast.success(t("inspector.overview.created"));
      return id;
    } catch (e) {
      toast.error((e as Error).message);
      return null;
    }
  };

  const [tab, setTab] = useState("data");
  const [nodeDraft, setNodeDraft] = useState<Network | null>(null);

  /** The file a new label is written to; see `labelTarget` for why ambiguity never creates one. */
  const ensureLabelMap = async (): Promise<string | null> => {
    const target = labelTarget(resolution);
    if (target.kind === "file") return target.fileId;
    if (target.kind === "create") return createMap();
    toast.warning(t("inspector.overview.chooseFirst"));
    setTab("overview");
    return null;
  };

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <SurfaceToolbar
        verbs={
          <ToolbarButton onClick={refresh} disabled={state === "loading"}>
            <RefreshCw className="h-4 w-4" /> {t("inspector.editor.refresh")}
          </ToolbarButton>
        }
        context={
          state === "ready" && !active ? (
            <ToolbarDiagnostic tone="warning">{t("inspector.contract.noLabels")}</ToolbarDiagnostic>
          ) : null
        }
      />
      {state === "loading" && !contract && (
        <p className="p-4 text-sm text-muted-foreground">{t("inspector.contract.loading")}</p>
      )}
      {state === "error" && error && (
        <div className="m-4 flex flex-col gap-2 rounded border border-[var(--mag)] p-4 text-sm">
          <p>
            {error.kind === "not-found"
              ? t("inspector.contract.notFound", { id: entry.id, node: client?.nodeHost ?? "" })
              : error.kind === "unreachable"
                ? t("inspector.contract.unreachable", { node: client?.nodeHost ?? "", message: error.message })
                : t("inspector.contract.nodeError", { message: error.message })}
          </p>
          <Button size="sm" variant="outline" className="self-start" onClick={refresh}>
            {t("inspector.contract.retry")}
          </Button>
          {nodeDraft === null ? (
            <Button size="sm" variant="ghost" className="self-start" onClick={() => setNodeDraft(entry.network)}>
              {t("inspector.contract.otherNode")}
            </Button>
          ) : (
            <div className="flex max-w-md flex-col gap-2">
              <NetworkPicker value={nodeDraft} onChange={setNodeDraft} />
              <Button size="sm" className="self-start" onClick={() => onMoveNetwork(nodeDraft)}>
                {t("inspector.contract.useNode")}
              </Button>
            </div>
          )}
        </div>
      )}
      {contract && client && (
        <Tabs value={tab} onValueChange={setTab} className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-2 self-start">
            <TabsTrigger value="overview">{t("inspector.contract.tabs.overview")}</TabsTrigger>
            <TabsTrigger value="data">{t("inspector.contract.tabs.data")}</TabsTrigger>
            <TabsTrigger value="maps">{t("inspector.contract.tabs.maps")}</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="min-h-0 flex-1 overflow-auto">
            <OverviewTab
              contract={contract}
              resolution={resolution}
              labelMaps={labelMaps}
              onPin={(m) => onPin(m.path)}
              onCreate={() => void createMap()}
              onAddHash={(m) =>
                addHashToLabelMap(fs, m.fileId, contract.machineCodeHashId, network)
                  .then(() => toast.success(t("inspector.overview.hashAdded", { name: m.name })))
                  .catch((e) => toast.error((e as Error).message))
              }
            />
          </TabsContent>
          <TabsContent value="data" className="min-h-0 flex-1 overflow-hidden">
            <DataStackTab contract={contract} labelMap={active} prefix={prefix} ensureLabelMap={ensureLabelMap} />
          </TabsContent>
          <TabsContent value="maps" className="min-h-0 flex-1 overflow-auto">
            <MapsTab contract={contract} client={client} labelMap={active} prefix={prefix} ensureLabelMap={ensureLabelMap} revision={revision} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
