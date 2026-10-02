import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import type { Contract } from "@signumjs/contracts";
import { toast } from "sonner";
import { ArrowLeft, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { t } from "@/i18n/runtime";
import { upsertCodeLabel, removeCodeLabel, upsertSlot } from "../model/label-map-edits";
import type { IndexedLabelMap } from "../model/resolve-label-map";
import type { WatchEntry } from "../model/watchlist";
import { slotUse } from "../disasm/xrefs";
import type { Capability } from "../disasm/capabilities";
import { exportAsm } from "../workspace/export-asm";
import { updateFileText } from "../workspace/update-file";
import { CodeDetail, type CodeSelection } from "./code-detail";
import { CodeLabelDialog } from "./code-label-dialog";
import { CodeListing } from "./code-listing";
import { CodeOutline } from "./code-outline";
import { SlotLabelDialog } from "./slot-label-dialog";
import { useDisassembly } from "./use-disassembly";
import { networkLabel } from "./watchlist-panel";

export type CodeFocus = { slot?: number; address?: number; nonce: number };

function capabilityText(c: Capability): string {
  switch (c) {
    case "sendsFunds":
      return t("inspector.code.caps.sendsFunds");
    case "assets":
      return t("inspector.code.caps.assets");
    case "writesMaps":
      return t("inspector.code.caps.writesMaps");
    case "readsMaps":
      return t("inspector.code.caps.readsMaps");
    case "readsBalances":
      return t("inspector.code.caps.readsBalances");
    case "crypto":
      return t("inspector.code.caps.crypto");
  }
}

export function CodeTab({
  contract,
  labelMap,
  entry,
  folderId,
  prefix,
  ensureLabelMap,
  focus,
  onFocusHandled,
  onShowSlot,
}: {
  contract: Contract;
  labelMap: IndexedLabelMap | null;
  entry: WatchEntry;
  folderId: string;
  prefix: "S" | "TS";
  ensureLabelMap: () => Promise<string | null>;
  focus: CodeFocus | null;
  /** Called once a focus request is applied, so a later remount does not apply it again. */
  onFocusHandled: () => void;
  onShowSlot: (index: number) => void;
}) {
  const fs = useFileSystem();
  const navigate = useNavigate();
  const map = labelMap?.map ?? null;
  const view = useDisassembly(contract, map, {
    contractId: contract.at,
    contractRS: contract.atRS,
    network: networkLabel(entry.network),
    codeHash: contract.machineCodeHashId,
    creatorRS: contract.creatorRS,
    labelsFile: labelMap?.path ?? null,
  });
  const [selection, setSelection] = useState<CodeSelection | null>(null);
  const [history, setHistory] = useState<number[]>([]);
  // A request, not a position: clicking the same entry twice must scroll twice.
  const [scrollTo, setScrollTo] = useState<{ address: number; nonce: number } | null>(null);
  const [showBytes, setShowBytes] = useState(false);
  const [showValues, setShowValues] = useState(true);
  const [slotDialog, setSlotDialog] = useState<number | null>(null);
  const [nameDialog, setNameDialog] = useState<number | null>(null);

  const go = (address: number) => {
    if (selection && selection.kind !== "slot") setHistory((h) => [...h, selection.address]);
    setSelection({ kind: "instruction", address });
    setScrollTo({ address, nonce: Date.now() });
  };

  useEffect(() => {
    if (!focus) return;
    if (focus.slot !== undefined) setSelection({ kind: "slot", index: focus.slot });
    if (focus.address !== undefined) go(focus.address);
    onFocusHandled();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.nonce]);

  const highlight = useMemo(() => {
    if (!view || selection?.kind !== "slot") return new Set<number>();
    const { reads, writes } = slotUse(view.xrefs, selection.index);
    return new Set([...reads, ...writes]);
  }, [view, selection]);

  if (!contract.machineCode) return <p className="p-4 text-sm">{t("inspector.code.noCode")}</p>;
  if (!view || view.dis.rows.length === 0) return <p className="p-4 text-sm">{t("inspector.code.empty")}</p>;

  const writeLabels = async (edit: (text: string) => string, done: string) => {
    const fileId = labelMap?.fileId ?? (await ensureLabelMap());
    if (!fileId) return;
    try {
      await updateFileText(fs, fileId, edit);
      toast.success(done);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const unknownCount = view.dis.rows.filter((r) => r.kind === "unknown").length + view.dis.misaligned.length;
  const verifyText =
    view.verify === null
      ? t("inspector.code.notAssemblable", { count: unknownCount })
      : view.verify === "pending"
        ? t("inspector.code.verifyPending")
        : view.verify.ok
          ? t("inspector.code.verifyOk")
          : view.verify.reason === "differs"
            ? t("inspector.code.verifyDiffers", { byte: view.verify.byte })
            : t("inspector.code.verifyCompile", { message: view.verify.message });
  const canExport = view.verify !== null && view.verify !== "pending" && view.verify.ok;

  const doExport = async () => {
    try {
      const { fileId, name } = await exportAsm(fs, folderId, entry.alias ?? contract.name, contract.at, view.asm());
      toast.success(t("inspector.code.exported", { name }), {
        action: { label: t("inspector.code.open"), onClick: () => navigate(`/projects/${folderId}/files/${fileId}`) },
      });
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const slotLabel = slotDialog !== null ? view.names.slotLabel[slotDialog] : null;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="flex flex-col gap-2 border-b px-4 py-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{t("inspector.code.caps.title")}:</span>
          {view.capabilities.length === 0 ? (
            <span className="text-muted-foreground">{t("inspector.code.caps.nothing")}</span>
          ) : (
            view.capabilities.map((c) => (
              <button
                key={c.capability}
                type="button"
                className="rounded border px-2 py-0.5"
                title={c.apis.join(", ")}
                onClick={() => go(c.sites[0]!)}
              >
                {capabilityText(c.capability)} ({c.sites.length})
              </button>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-muted-foreground">
          <span>
            {t("inspector.code.size", {
              bytes: view.dis.codeLength,
              instructions: view.dis.instructions.length,
              pages: Math.ceil(view.dis.codeLength / 256),
            })}
          </span>
          <span className={view.verify !== null && view.verify !== "pending" && view.verify.ok ? "text-[var(--green)]" : ""}>
            {verifyText}
          </span>
          <label className="flex items-center gap-1">
            <Checkbox checked={showBytes} onCheckedChange={(v) => setShowBytes(v === true)} /> {t("inspector.code.showBytes")}
          </label>
          <label className="flex items-center gap-1">
            <Checkbox checked={showValues} onCheckedChange={(v) => setShowValues(v === true)} /> {t("inspector.code.showValues")}
          </label>
          {history.length > 0 && (
            <Button size="sm" variant="ghost" onClick={() => {
              const previous = history.at(-1)!;
              setHistory((h) => h.slice(0, -1));
              setSelection({ kind: "instruction", address: previous });
              setScrollTo({ address: previous, nonce: Date.now() });
            }}>
              <ArrowLeft className="h-3.5 w-3.5" /> {t("inspector.code.back")}
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            disabled={!canExport}
            title={canExport ? undefined : t("inspector.code.exportDisabled")}
            onClick={() => void doExport()}
          >
            <Download className="h-3.5 w-3.5" /> {t("inspector.code.export")}
          </Button>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <CodeOutline outline={view.outline} names={view.names} onGo={go} map={map} codeHash={contract.machineCodeHashId} />
        <CodeListing
          view={view}
          machineData={contract.machineData}
          prefix={prefix}
          enums={map?.enums ?? {}}
          selection={selection}
          highlight={highlight}
          showBytes={showBytes}
          showValues={showValues}
          scrollTo={scrollTo}
          map={map}
          codeHash={contract.machineCodeHashId}
          onSelect={(s) => {
            if (s.kind === "target") go(s.address);
            else setSelection(s);
          }}
        />
        <aside className="w-80 shrink-0 overflow-auto border-l">
          <CodeDetail
            view={view}
            selection={selection}
            map={map}
            codeHash={contract.machineCodeHashId}
            machineData={contract.machineData}
            prefix={prefix}
            onGo={go}
            onLabelSlot={setSlotDialog}
            onNameLocation={setNameDialog}
            onShowInData={onShowSlot}
          />
        </aside>
      </div>
      {slotDialog !== null && (
        <SlotLabelDialog
          open
          onOpenChange={(o) => !o && setSlotDialog(null)}
          initial={slotLabel ?? { index: slotDialog, name: "" }}
          enums={Object.keys(map?.enums ?? {})}
          onSave={(slot) => void writeLabels((text) => upsertSlot(text, slot), t("inspector.data.saved"))}
        />
      )}
      {nameDialog !== null && (
        <CodeLabelDialog
          open
          onOpenChange={(o) => !o && setNameDialog(null)}
          address={nameDialog}
          initial={view.names.codeLabel.get(nameDialog)?.name ?? ""}
          onSave={(name) =>
            void writeLabels((text) => upsertCodeLabel(text, { address: nameDialog, name }), t("inspector.codeLabel.saved"))
          }
          onRemove={
            view.names.codeLabel.has(nameDialog)
              ? () => void writeLabels((text) => removeCodeLabel(text, nameDialog), t("inspector.codeLabel.saved"))
              : undefined
          }
        />
      )}
    </div>
  );
}
