import { useEffect, useState } from "react";
import { DiffEditor } from "@monaco-editor/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n/runtime";
import { registerSmartC, SMARTC_LANGUAGE_ID } from "@/features/smartc-editor/language/register";
import { EDITOR_SCROLLBAR } from "@/theme/monaco-themes";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { useAssistant } from "../bridge/use-assistant";

export interface RoundDiffTarget {
  checkpointId: string;
  projectId: string;
  /** Workspace path as the agent wrote it, e.g. `/Project/dir/a.smart.c`. */
  path: string;
}

/* The agent's paths start with the project name; checkpoints store paths relative to the project. */
export function relPathInProject(path: string): string {
  return path.split("/").slice(2).join("/");
}

export function languageOf(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".smart.c")) return SMARTC_LANGUAGE_ID;
  if (lower.endsWith(".ts")) return "typescript";
  if (lower.endsWith(".json")) return "json";
  return "plaintext";
}

/* Both sides are read-only: this dialog shows history, it never edits. */
export function RoundDiffDialog({ target, onClose }: { target: RoundDiffTarget | null; onClose: () => void }) {
  const { loadDiff } = useAssistant();
  const monacoTheme = useMonacoTheme();
  const [diff, setDiff] = useState<{ original: string; modified: string; deleted: boolean } | null>(null);

  useEffect(() => {
    setDiff(null);
    if (!target) return;
    let cancelled = false;
    loadDiff(target.checkpointId, target.projectId, relPathInProject(target.path))
      .then((d) => !cancelled && setDiff(d))
      .catch(() => !cancelled && setDiff({ original: "", modified: "", deleted: true }));
    return () => {
      cancelled = true;
    };
    // loadDiff is recreated every render; the target decides what to load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[90vw] h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("assistant.feed.diffTitle", { path: target?.path ?? "" })}</DialogTitle>
          <DialogDescription>{diff?.deleted ? t("assistant.restore.fileDeleted") : ""}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1">
          {target && diff && (
            <DiffEditor
              height="100%"
              language={languageOf(target.path)}
              original={diff.original}
              modified={diff.modified}
              theme={monacoTheme}
              beforeMount={(monaco) => registerSmartC(monaco)}
              options={{ readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false }, scrollbar: EDITOR_SCROLLBAR, scrollBeyondLastLine: false, fontSize: 13 }}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
