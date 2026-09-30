import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SurfaceToolbar, ToolbarButton, ToolbarDiagnostic } from "@/components/ui/surface-toolbar";
import { EditorFileActions } from "@/components/ui/editor/file-actions.tsx";
import type { File } from "@/lib/file-system";
import { t } from "@/i18n/runtime";
import { isFixedGroup, parseLabelMap, type MapGroup, type SlotLabel } from "../model/label-map";
import {
  addCodeHash,
  removeCodeHash,
  removeEnum,
  removeMapGroup,
  removeSlot,
  setEnum,
  upsertMapGroup,
  upsertSlot,
} from "../model/label-map-edits";
import { applyMerge } from "../model/merge-labels";
import { useFollowedFile } from "../workspace/use-followed-file";
import { enumToLines, parseEnumLines } from "./enum-lines";
import { GenerateLabelsDialog } from "./generate-labels-dialog";
import { JsoncSourceEditor } from "./jsonc-source-editor";
import { writeThrough } from "./write-through";
import { MapGroupDialog } from "./map-group-dialog";
import { SlotLabelDialog } from "./slot-label-dialog";

/**
 * The editor for a `*.labels.json`: tables over the same text the JSON view
 * shows. Every change goes through a comment-preserving edit of that text,
 * then through the ordinary save — there is no second model to fall out of
 * step with the file.
 */
export function LabelMapEditor({ file }: { file: File }) {
  const editor = useFollowedFile(file);
  const parsed = useMemo(() => parseLabelMap(editor.text), [editor.text]);
  const [view, setView] = useState<"ui" | "json">(parsed.ok ? "ui" : "json");
  const [slot, setSlot] = useState<SlotLabel | null>(null);
  const [group, setGroup] = useState<MapGroup | null>(null);
  const [generating, setGenerating] = useState(false);
  const [enumDraft, setEnumDraft] = useState({ name: "", lines: "" });
  const [hashDraft, setHashDraft] = useState({ hash: "", network: "", note: "" });

  const write = (edit: (text: string) => string) => {
    try {
      void writeThrough(editor, edit);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const map = parsed.ok ? parsed.value : null;

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
            <ToolbarButton onClick={() => setGenerating(true)} disabled={!parsed.ok}>
              <Wand2 className="h-4 w-4" /> {t("inspector.labels.generate")}
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

      {view === "json" || !map ? (
        <JsoncSourceEditor editor={editor} path={file.metadata.path} />
      ) : (
        <Tabs defaultValue="slots" className="flex min-h-0 flex-1 flex-col">
          <TabsList className="mx-4 mt-2 self-start">
            <TabsTrigger value="slots">{t("inspector.labels.tabs.slots")}</TabsTrigger>
            <TabsTrigger value="maps">{t("inspector.labels.tabs.maps")}</TabsTrigger>
            <TabsTrigger value="enums">{t("inspector.labels.tabs.enums")}</TabsTrigger>
            <TabsTrigger value="hashes">{t("inspector.labels.tabs.hashes")}</TabsTrigger>
          </TabsList>

          <TabsContent value="slots" className="min-h-0 flex-1 overflow-auto p-4">
            <Button size="sm" variant="outline" onClick={() => setSlot({ index: map.slots.length ? Math.max(...map.slots.map((s) => s.index)) + 1 : 0, name: "" })}>
              {t("inspector.labels.add")}
            </Button>
            <table className="mt-2 w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-right">{t("inspector.labels.index")}</th>
                  <th className="px-2 text-left">{t("inspector.labels.name")}</th>
                  <th className="px-2 text-left">{t("inspector.labels.format")}</th>
                  <th className="px-2 text-left">{t("inspector.labels.length")}</th>
                  <th className="px-2 text-left">{t("inspector.labels.origin")}</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {map.slots.map((s) => (
                  <tr key={s.index} className="hover:bg-accent">
                    <td className="text-right font-mono">{s.index}</td>
                    <td className="px-2">{s.name}</td>
                    <td className="px-2 font-mono text-xs">{s.format ?? ""}{s.enum ? ` (${s.enum})` : ""}</td>
                    <td className="px-2">{s.length ?? ""}</td>
                    <td className="px-2 text-xs text-muted-foreground">{s.origin ?? "manual"}</td>
                    <td className="whitespace-nowrap text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSlot(s)}>{t("inspector.labels.edit")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => write((x) => removeSlot(x, s.index))}>{t("inspector.labels.remove")}</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {map.slots.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("inspector.labels.noEntries")}</p>}
          </TabsContent>

          <TabsContent value="maps" className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setGroup({ key1: "0", name: "" })}>
                {t("inspector.labels.add")} ({t("inspector.labels.key1")})
              </Button>
              <Button size="sm" variant="outline" onClick={() => setGroup({ key1Format: "address", name: "" })}>
                {t("inspector.labels.add")} ({t("inspector.group.key1Format")})
              </Button>
            </div>
            <ul className="mt-2 text-sm">
              {map.maps.map((g, i) => (
                <li key={i} className="flex items-center gap-2 border-b py-1">
                  <span className="flex-1">
                    {g.name}{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {isFixedGroup(g) ? `key1 ${g.key1}` : `key1: ${g.key1Format}`}
                    </span>
                  </span>
                  <Button size="sm" variant="ghost" onClick={() => setGroup(g)}>{t("inspector.labels.edit")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => write((x) => removeMapGroup(x, i))}>{t("inspector.labels.remove")}</Button>
                </li>
              ))}
            </ul>
            {map.maps.length === 0 && <p className="mt-2 text-xs text-muted-foreground">{t("inspector.labels.noEntries")}</p>}
          </TabsContent>

          <TabsContent value="enums" className="min-h-0 flex-1 overflow-auto p-4">
            <div className="flex flex-col gap-2">
              {Object.entries(map.enums).map(([name, values]) => (
                <div key={name} className="flex items-start gap-2 border-b pb-2 text-sm">
                  <span className="w-40 font-mono">{name}</span>
                  <pre className="flex-1 text-xs">{enumToLines(values)}</pre>
                  <Button size="sm" variant="ghost" onClick={() => setEnumDraft({ name, lines: enumToLines(values) })}>{t("inspector.labels.edit")}</Button>
                  <Button size="sm" variant="ghost" onClick={() => write((x) => removeEnum(x, name))}>{t("inspector.labels.remove")}</Button>
                </div>
              ))}
              <Input placeholder={t("inspector.labels.enumName")} value={enumDraft.name} onChange={(e) => setEnumDraft((d) => ({ ...d, name: e.target.value }))} />
              <Textarea placeholder={t("inspector.labels.enumValues")} rows={5} value={enumDraft.lines} onChange={(e) => setEnumDraft((d) => ({ ...d, lines: e.target.value }))} />
              <Button
                size="sm"
                className="self-start"
                disabled={!enumDraft.name.trim()}
                onClick={() => {
                  const values = parseEnumLines(enumDraft.lines);
                  if (!values) return toast.error(t("inspector.labels.enumInvalid"));
                  write((x) => setEnum(x, enumDraft.name.trim(), values));
                  setEnumDraft({ name: "", lines: "" });
                }}
              >
                {t("inspector.labels.add")}
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="hashes" className="min-h-0 flex-1 overflow-auto p-4">
            <ul className="text-sm">
              {map.codeHashes.map((h) => (
                <li key={h.hash} className="flex items-center gap-2 border-b py-1">
                  <span className="font-mono">{h.hash}</span>
                  <span className="text-xs text-muted-foreground">{[h.network, h.note].filter(Boolean).join(" · ")}</span>
                  <span className="flex-1" />
                  <Button size="sm" variant="ghost" onClick={() => write((x) => removeCodeHash(x, h.hash))}>{t("inspector.labels.remove")}</Button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex gap-2">
              <Input placeholder={t("inspector.labels.hash")} value={hashDraft.hash} onChange={(e) => setHashDraft((d) => ({ ...d, hash: e.target.value }))} />
              <Input placeholder={t("inspector.labels.hashNetwork")} value={hashDraft.network} onChange={(e) => setHashDraft((d) => ({ ...d, network: e.target.value }))} />
              <Input placeholder={t("inspector.labels.hashNote")} value={hashDraft.note} onChange={(e) => setHashDraft((d) => ({ ...d, note: e.target.value }))} />
              <Button
                onClick={() => {
                  if (!/^\d+$/.test(hashDraft.hash.trim())) return toast.error(t("inspector.labels.hashInvalid"));
                  write((x) =>
                    addCodeHash(x, {
                      hash: hashDraft.hash.trim(),
                      ...(hashDraft.network.trim() ? { network: hashDraft.network.trim() } : {}),
                      ...(hashDraft.note.trim() ? { note: hashDraft.note.trim() } : {}),
                    }),
                  );
                  setHashDraft({ hash: "", network: "", note: "" });
                }}
              >
                {t("inspector.labels.add")}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      )}

      {slot && map && (
        <SlotLabelDialog
          open
          onOpenChange={(o) => !o && setSlot(null)}
          initial={slot}
          enums={Object.keys(map.enums)}
          onSave={(s) => write((x) => upsertSlot(x, s))}
        />
      )}
      {group && (
        <MapGroupDialog open onOpenChange={(o) => !o && setGroup(null)} initial={group} onSave={(g) => write((x) => upsertMapGroup(x, g))} />
      )}
      {generating && map && (
        <GenerateLabelsDialog
          open
          onOpenChange={setGenerating}
          current={map}
          onApply={(merged) => {
            write((x) => applyMerge(x, merged));
            toast.success(t("inspector.generate.applied"));
          }}
        />
      )}
    </div>
  );
}
