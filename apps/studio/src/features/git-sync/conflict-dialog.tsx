import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useFileSystem } from "@/hooks/use-file-system";
import { t } from "@/i18n/runtime";
import { captureProject } from "@/features/assistant/rounds/checkpoints";
import { languageOf, RoundDiff } from "@/features/assistant/ui/round-diff-dialog";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import type { PreparedPull } from "./sync-service";

type Choice = "mine" | "theirs";

interface Props {
  prepared: PreparedPull | null;
  busy: boolean;
  onResolve: (choices: Record<string, Choice>) => void;
  onCancel: () => void;
}

export function ConflictDialog({ prepared, busy, onResolve, onCancel }: Props) {
  const fs = useFileSystem();
  const theme = useMonacoTheme();
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [localText, setLocalText] = useState<Map<string, string> | null>(null);

  useEffect(() => {
    setChoices({});
    setSelected(prepared?.conflicts[0]?.relPath ?? null);
    setLocalText(null);
    if (!prepared) return;
    let cancelled = false;
    captureProject(fs, prepared.projectId)
      .then((files) => {
        if (cancelled) return;
        setLocalText(new Map(files.map((f) => [f.relPath, typeof f.content === "string" ? f.content : String(f.content ?? "")])));
      })
      .catch(() => !cancelled && setLocalText(new Map()));
    return () => {
      cancelled = true;
    };
  }, [fs, prepared]);

  const conflicts = prepared?.conflicts ?? [];
  const current = conflicts.find((c) => c.relPath === selected) ?? null;
  const allChosen = conflicts.length > 0 && conflicts.every((c) => choices[c.relPath]);

  return (
    <Dialog open={prepared !== null} onOpenChange={(open) => !open && !busy && onCancel()}>
      <DialogContent className="sm:max-w-[90vw] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("project.git.conflict.title")}</DialogTitle>
          <DialogDescription>{t("project.git.conflict.description")}</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 gap-4">
          <div className="w-72 shrink-0 space-y-2 overflow-y-auto">
            <Label>{t("project.git.conflict.files")}</Label>
            {conflicts.map((c) => (
              <div
                key={c.relPath}
                className={`rounded-md border p-2 ${c.relPath === selected ? "border-ring" : ""}`}
              >
                <button
                  type="button"
                  className="block w-full break-all text-left font-mono text-xs"
                  onClick={() => setSelected(c.relPath)}
                >
                  {c.relPath}
                </button>
                <RadioGroup
                  className="mt-2 flex gap-4"
                  value={choices[c.relPath] ?? ""}
                  onValueChange={(v) => setChoices((prev) => ({ ...prev, [c.relPath]: v as Choice }))}
                >
                  {(["mine", "theirs"] as const).map((side) => (
                    <div key={side} className="flex items-center gap-1.5">
                      <RadioGroupItem id={`choice-${c.relPath}-${side}`} value={side} />
                      <Label htmlFor={`choice-${c.relPath}-${side}`} className="font-normal">
                        {t(`project.git.conflict.${side}`)}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            ))}
          </div>
          <div className="flex min-w-0 flex-1 flex-col">
            {current && prepared && localText && (
              <>
                <div className="flex text-xs text-muted-foreground">
                  <span className="flex-1">
                    {t("project.git.conflict.local")}
                    {current.local === null && ` · ${t("project.git.conflict.deleted")}`}
                  </span>
                  <span className="flex-1">
                    {t("project.git.conflict.remote")}
                    {current.remote === null && ` · ${t("project.git.conflict.deleted")}`}
                  </span>
                </div>
                <div className="min-h-0 flex-1">
                  <RoundDiff
                    key={current.relPath}
                    checkpointId={`conflict-${prepared.head.commit}`}
                    relPath={current.relPath}
                    language={languageOf(current.relPath)}
                    diff={{
                      original: current.local === null ? "" : (localText.get(current.relPath) ?? ""),
                      modified: current.remote === null ? "" : (prepared.remoteText[current.relPath] ?? ""),
                    }}
                    theme={theme}
                  />
                </div>
              </>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={busy}>
            {t("common.actions.cancel")}
          </Button>
          <Button variant="accent" onClick={() => onResolve(choices)} disabled={!allChosen || busy}>
            {busy ? t("project.git.conflict.applying") : t("project.git.conflict.apply")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
