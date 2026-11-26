import { useEffect, useMemo } from "react";
import { useAtomValue } from "jotai";
import type { OnMount } from "@monaco-editor/react";
import { t } from "@/i18n/runtime";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import { findProjectOfFolder } from "@/features/project/project-root";
import { diffLines, type LineChange } from "../activity/line-diff";
import { baselineAtom } from "../state";

type StandaloneEditor = Parameters<OnMount>[0];
type MonacoApi = Parameters<OnMount>[1];

const RECOMPUTE_MS = 300;

/*
 * Gutter markers (green new, blue changed, red removed) against the project's
 * baseline checkpoint, for one editor. The baseline outlives the round, so the user
 * can still see what the agent did after the lock is gone. Clicking a marker shows
 * the old text in a view zone below the line. Nothing is drawn without a baseline.
 */
export function useGutterMarkers(editor: StandaloneEditor | null, monaco: MonacoApi | null, file: File): void {
  const fs = useFileSystem();
  const baselines = useAtomValue(baselineAtom);
  const projectId = findProjectOfFolder(fs, file.metadata.folderId);
  const path = file.metadata.path;

  /* A string, so the effect below only reruns when this file's baseline text really changes. */
  const baselineText = useMemo<string | null>(() => {
    const files = projectId ? baselines[projectId] : undefined;
    if (!projectId || !files) return null;
    const relPath = path.slice(fs.getFolder(projectId).path.length).replace(/^\//, "");
    const found = files.find((f) => f.relPath === relPath);
    // A file the baseline lacks is new in this round.
    if (!found) return "";
    return typeof found.content === "string" ? found.content : null;
  }, [baselines, projectId, path, fs]);

  useEffect(() => {
    if (!editor || !monaco || baselineText === null) return;
    const model = editor.getModel();
    if (!model) return;

    /* Editors without a glyph margin get one only while markers exist. */
    const hadGlyphMargin = editor.getRawOptions().glyphMargin === true;
    if (!hadGlyphMargin) editor.updateOptions({ glyphMargin: true });

    const decorations = editor.createDecorationsCollection();
    let changes: LineChange[] = [];
    const zones = new Map<number, string>();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const clearZones = () => {
      if (zones.size === 0) return;
      editor.changeViewZones((accessor) => {
        for (const id of zones.values()) accessor.removeZone(id);
      });
      zones.clear();
    };

    /* Zones are anchored to lines that the next recompute may move, so they go with the old decorations. */
    const recompute = () => {
      clearZones();
      changes = diffLines(baselineText, model.getValue());
      decorations.set(
        changes.map((c) => ({
          range: new monaco.Range(c.startLine, 1, c.endLine, 1),
          options: {
            isWholeLine: true,
            glyphMarginClassName: `assistant-gutter-${c.kind}`,
            glyphMarginHoverMessage: { value: t(`assistant.gutter.${c.kind}`) },
          },
        })),
      );
    };

    const toggleZone = (change: LineChange) => {
      const key = change.startLine;
      const existing = zones.get(key);
      editor.changeViewZones((accessor) => {
        if (existing !== undefined) {
          accessor.removeZone(existing);
          zones.delete(key);
          return;
        }
        const node = document.createElement("pre");
        node.className = "assistant-old-text";
        node.setAttribute("aria-label", t("assistant.gutter.previous"));
        // textContent, never innerHTML: the old text is arbitrary file content.
        node.textContent = change.oldText;
        zones.set(
          key,
          accessor.addZone({
            afterLineNumber: change.endLine,
            heightInLines: change.oldText.split("\n").length,
            domNode: node,
          }),
        );
      });
    };

    recompute();

    const content = model.onDidChangeContent(() => {
      clearTimeout(timer);
      timer = setTimeout(recompute, RECOMPUTE_MS);
    });
    const click = editor.onMouseDown((e) => {
      if (e.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN || !e.target.position) return;
      const line = e.target.position.lineNumber;
      const hit = changes.find((c) => c.kind !== "added" && line >= c.startLine && line <= c.endLine);
      if (hit) toggleZone(hit);
    });

    return () => {
      clearTimeout(timer);
      content.dispose();
      click.dispose();
      clearZones();
      decorations.clear();
      if (!hadGlyphMargin) editor.updateOptions({ glyphMargin: false });
    };
  }, [editor, monaco, baselineText]);
}
