import { useMemo, useState } from "react";
import { useSearchParams } from "react-router";
import { toast } from "sonner";
import { SurfaceToolbar, ToolbarButton, ToolbarDiagnostic } from "@/components/ui/surface-toolbar";
import { EditorFileActions } from "@/components/ui/editor/file-actions.tsx";
import type { File } from "@/lib/file-system";
import { t } from "@/i18n/runtime";
import { addContracts, moveContract, parseWatchlist, removeContract, updateContract, type WatchEntry } from "../model/watchlist";
import { useFollowedFile } from "../workspace/use-followed-file";
import { JsoncSourceEditor } from "./jsonc-source-editor";
import { writeThrough } from "./write-through";
import { ContractView } from "./contract-view";
import { entryKey, WatchlistPanel } from "./watchlist-panel";
import { AddContractDialog } from "./add-contract-dialog";

/**
 * The editor for a `*.inspect.json`: the watchlist on the left, the selected
 * contract on the right. A file that does not validate opens in its JSON view
 * — the inspector never rewrites a file it cannot read.
 */
export function InspectorEditor({ file }: { file: File }) {
  const editor = useFollowedFile(file);
  const parsed = useMemo(() => parseWatchlist(editor.text), [editor.text]);
  const [view, setView] = useState<"ui" | "json">(parsed.ok ? "ui" : "json");
  const [params, setParams] = useSearchParams();
  const [adding, setAdding] = useState(false);

  const entries = parsed.ok ? parsed.value.contracts : [];
  // `?contract=<id>` comes from "Inspect" after a deploy; `?entry=` from a click here.
  const requested = entries.find((e) => e.id === params.get("contract"));
  const selectedKey =
    params.get("entry") ?? (requested ? entryKey(requested) : null) ?? (entries[0] ? entryKey(entries[0]) : null);
  const selected = entries.find((e) => entryKey(e) === selectedKey) ?? null;

  const write = (edit: (text: string) => string) => {
    try {
      void writeThrough(editor, edit);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const select = (key: string) => {
    params.set("entry", key);
    params.delete("contract");
    setParams(params, { replace: true });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SurfaceToolbar
        verbs={
          <>
            <ToolbarButton weight={view === "ui" ? "primary" : "secondary"} onClick={() => setView("ui")} disabled={!parsed.ok}>
              {t("inspector.editor.viewUi")}
            </ToolbarButton>
            <ToolbarButton weight={view === "json" ? "primary" : "secondary"} onClick={() => setView("json")}>
              {t("inspector.editor.viewJson")}
            </ToolbarButton>
          </>
        }
        context={
          !parsed.ok ? (
            <ToolbarDiagnostic tone="error">
              {t("inspector.editor.invalid", { count: parsed.errors.length })}{" "}
              {t("inspector.validation.at", { line: parsed.errors[0]!.line, message: parsed.errors[0]!.message })}
            </ToolbarDiagnostic>
          ) : null
        }
        readout={<EditorFileActions isDirty={editor.isDirty} onSave={editor.saveNow} onDownload={editor.download} />}
      />
      {view === "json" || !parsed.ok ? (
        <JsoncSourceEditor editor={editor} path={file.metadata.path} />
      ) : (
        <div className="flex min-h-0 flex-1">
          <WatchlistPanel
            entries={entries}
            selected={selected ? entryKey(selected) : null}
            onSelect={select}
            onAdd={() => setAdding(true)}
            onRemove={(e: WatchEntry) => write((text) => removeContract(text, e.id, e.network))}
          />
          {selected ? (
            <ContractView
              key={entryKey(selected)}
              entry={selected}
              folderId={file.metadata.folderId}
              onPin={(path) => write((text) => updateContract(text, selected.id, selected.network, { labelMap: path }))}
              onMoveNetwork={(to) => {
                write((text) => moveContract(text, selected.id, selected.network, to));
                select(entryKey({ ...selected, network: to }));
              }}
            />
          ) : (
            <p className="p-4 text-sm text-muted-foreground">{t("inspector.editor.select")}</p>
          )}
        </div>
      )}
      <AddContractDialog
        open={adding}
        onOpenChange={setAdding}
        onAdd={(added) => write((text) => addContracts(text, added))}
      />
    </div>
  );
}
