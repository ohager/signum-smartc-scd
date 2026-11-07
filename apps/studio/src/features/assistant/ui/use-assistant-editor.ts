import { useCallback, useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import type { OnMount } from "@monaco-editor/react";
import { t } from "@/i18n/runtime";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import { findProjectOfFolder } from "@/features/project/project-root";
import { editorRegistry, type EditorDiagnostic } from "../editor-registry";
import { lockedProjectsAtom } from "../state";

/* @monaco-editor/react resolves its own monaco-editor, so the types come from its OnMount. */
type StandaloneEditor = Parameters<OnMount>[0];
type MonacoApi = Parameters<OnMount>[1];

const MARKER_ERROR = 8;
const MARKER_WARNING = 4;

/* Compile and lint markers both count; the agent sees what the user sees in the gutter. */
function diagnosticsOf(editor: StandaloneEditor, monaco: MonacoApi): EditorDiagnostic[] {
  const model = editor.getModel();
  if (!model) return [];
  return monaco.editor.getModelMarkers({ resource: model.uri }).map((m) => ({
    line: m.startLineNumber,
    severity: m.severity === MARKER_ERROR ? "error" : m.severity === MARKER_WARNING ? "warning" : "info",
    message: m.message,
    source: m.owner,
  }));
}

/*
 * The editors keep (editor, monaco) from onMount. Handing them to the hook as state
 * (not refs) makes the hook's effects run once Monaco exists.
 */
export function useEditorHandles() {
  const [handles, setHandles] = useState<{ editor: StandaloneEditor; monaco: MonacoApi } | null>(null);
  const capture = useCallback((editor: StandaloneEditor, monaco: MonacoApi) => setHandles({ editor, monaco }), []);
  return { editor: handles?.editor ?? null, monaco: handles?.monaco ?? null, capture };
}

/*
 * Wires one Monaco editor into the assistant: registration for the editor-context
 * tools, and the read-only lock while an agent works on the file's project. The lock
 * is applied from an effect on the atom, so editors opened mid-round lock on mount.
 *
 * `ownReadOnly` is for editors that are read-only for their own reasons; none is today,
 * but unlocking must never make such an editor writable.
 */
export function useAssistantEditor({
  editor,
  monaco,
  file,
  ownReadOnly = false,
}: {
  editor: StandaloneEditor | null;
  monaco: MonacoApi | null;
  file: File;
  ownReadOnly?: boolean;
}): void {
  const fs = useFileSystem();
  const locked = useAtomValue(lockedProjectsAtom);
  const projectId = findProjectOfFolder(fs, file.metadata.folderId);
  const isLocked = projectId !== null && locked.has(projectId);
  const { id: fileId, path } = file.metadata;

  useEffect(() => {
    if (!editor || !monaco) return;
    const unregister = editorRegistry.register({
      fileId,
      path,
      getCursor: () => {
        const p = editor.getPosition();
        return { line: p?.lineNumber ?? 1, column: p?.column ?? 1 };
      },
      getSelection: () => {
        const s = editor.getSelection();
        const model = editor.getModel();
        if (!s || !model || s.isEmpty()) return null;
        return {
          from: { line: s.startLineNumber, column: s.startColumn },
          to: { line: s.endLineNumber, column: s.endColumn },
          text: model.getValueInRange(s),
        };
      },
      getDiagnostics: () => diagnosticsOf(editor, monaco),
      reveal: (line) => {
        const target = Math.min(Math.max(1, line), editor.getModel()?.getLineCount() ?? line);
        editor.revealLineInCenter(target);
        editor.setPosition({ lineNumber: target, column: 1 });
        editor.focus();
      },
    });
    // The editor that already has focus when it registers is the active one.
    if (editor.hasTextFocus()) editorRegistry.setActive(fileId);
    const focus = editor.onDidFocusEditorText(() => editorRegistry.setActive(fileId));
    return () => {
      focus.dispose();
      unregister();
    };
  }, [editor, monaco, fileId, path]);

  useEffect(() => {
    editor?.updateOptions({
      readOnly: isLocked || ownReadOnly,
      readOnlyMessage: { value: t("assistant.lock.readOnly") },
    });
  }, [editor, isLocked, ownReadOnly]);
}
