import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { t } from "@/i18n/runtime";
import { generateLabels } from "../compiler/label-generator";
import type { LabelMap } from "../model/label-map";
import { mergeGenerated, type MergeConflict } from "../model/merge-labels";

type Preview =
  | { ok: true; merged: LabelMap; conflicts: MergeConflict[]; typed: boolean; hash: string; file: string }
  | { ok: false; message: string };

export function GenerateLabelsDialog({
  open,
  onOpenChange,
  current,
  onApply,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  current: LabelMap;
  onApply: (merged: LabelMap) => void;
}) {
  const fs = useFileSystem();
  const sources = useMemo(
    () => (open ? fs.listFilesRecursive().filter((f) => f.name.endsWith(".smart.c")) : []),
    [fs, open],
  );
  const [fileId, setFileId] = useState<string>(() =>
    sources.find((s) => s.name === current.source?.file)?.id ?? sources[0]?.id ?? "",
  );
  const [preview, setPreview] = useState<Preview | null>(null);

  const run = async () => {
    const meta = sources.find((s) => s.id === fileId);
    if (!meta) return;
    const { content } = await fs.loadFile<string>(fileId);
    const result = generateLabels(content ?? "");
    if (!result.ok) {
      setPreview({ ok: false, message: t("inspector.generate.compileError", { line: result.error.line, message: result.error.message }) });
      return;
    }
    const { map, conflicts } = mergeGenerated(current, result.labels, { sourceFile: meta.name, now: new Date() });
    setPreview({ ok: true, merged: map, conflicts, typed: result.labels.typed, hash: result.labels.codeHash, file: meta.name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{t("inspector.generate.title")}</DialogTitle>
        </DialogHeader>
        {sources.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("inspector.generate.noSources")}</p>
        ) : (
          <div className="flex flex-col gap-3 text-sm">
            <Label>{t("inspector.generate.source")}</Label>
            <Select value={fileId} onValueChange={(v) => { setFileId(v); setPreview(null); }}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {sources.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.path}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" className="self-start" onClick={() => void run()}>
              {t("inspector.generate.run")}
            </Button>
            {preview && !preview.ok && <p className="text-[var(--mag)]">{preview.message}</p>}
            {preview?.ok && (
              <>
                <p>
                  {t("inspector.generate.summary", {
                    slots: preview.merged.slots.filter((s) => s.origin === "compiler").length,
                    codeLabels: preview.merged.codeLabels.length,
                    file: preview.file,
                    hash: preview.hash,
                  })}
                </p>
                {!preview.typed && <p className="text-[var(--amber)]">{t("inspector.generate.untyped")}</p>}
                {preview.conflicts.length > 0 && (
                  <div>
                    <p>{t("inspector.generate.conflicts")}</p>
                    <ul className="list-disc pl-5">
                      {preview.conflicts.map((c) => (
                        <li key={c.index}>{t("inspector.generate.conflict", { ...c })}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>
        )}
        <DialogFooter>
          <Button
            disabled={!preview?.ok}
            onClick={() => {
              if (preview?.ok) onApply(preview.merged);
              onOpenChange(false);
            }}
          >
            {t("inspector.generate.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
