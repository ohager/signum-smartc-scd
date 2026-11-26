import { useEffect, useRef, useState } from "react";
import { DiffEditor, type DiffOnMount } from "@monaco-editor/react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { t } from "@/i18n/runtime";
import { registerSmartC, SMARTC_LANGUAGE_ID } from "@/features/smartc-editor/language/register";
import { EDITOR_SCROLLBAR } from "@/theme/monaco-themes";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { useAssistant } from "../bridge/use-assistant";
import { diffModelPaths } from "./diff-model-paths";

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
            <RoundDiff checkpointId={target.checkpointId} relPath={relPathInProject(target.path)} language={languageOf(target.path)} diff={diff} theme={monacoTheme} />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

let openings = 0;

/*
 * Unmount order matters. DiffEditor's own cleanup disposes both models first and the
 * widget after, and Monaco throws "TextModel got disposed before DiffEditorWidget model
 * got reset". So DiffEditor is told to keep its models (keepCurrent*Model) and we tear down
 * ourselves: detach the models from the widget with setModel(null), only then dispose them.
 * The widget itself is disposed afterwards by DiffEditor's cleanup, which is then harmless.
 * Each mount gets its own model paths, so a reopen never finds a disposed model.
 */
function RoundDiff({ checkpointId, relPath, language, diff, theme }: { checkpointId: string; relPath: string; language: string; diff: { original: string; modified: string }; theme: string }) {
  const editorRef = useRef<Parameters<DiffOnMount>[0] | null>(null);
  const [paths] = useState(() => diffModelPaths(checkpointId, relPath, ++openings));

  useEffect(
    () => () => {
      const editor = editorRef.current;
      editorRef.current = null;
      if (!editor) return;
      const models = editor.getModel();
      editor.setModel(null);
      models?.original.dispose();
      models?.modified.dispose();
    },
    [],
  );

  return (
    <DiffEditor
      height="100%"
      language={language}
      original={diff.original}
      modified={diff.modified}
      originalModelPath={paths.original}
      modifiedModelPath={paths.modified}
      keepCurrentOriginalModel
      keepCurrentModifiedModel
      theme={theme}
      beforeMount={(monaco) => registerSmartC(monaco)}
      onMount={(editor) => {
        editorRef.current = editor;
      }}
      options={{ readOnly: true, originalEditable: false, renderSideBySide: true, minimap: { enabled: false }, scrollbar: EDITOR_SCROLLBAR, scrollBeyondLastLine: false, fontSize: 13 }}
    />
  );
}
