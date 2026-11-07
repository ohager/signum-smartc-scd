import { useEffect, useRef } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useEditorFile, type EditorFile } from "@/components/ui/editor/use-editor-file.ts";
import type { File, FileSystemEvent, FileSystemEventType } from "@/lib/file-system";
import { reloadsOn, shouldAdopt } from "./should-adopt.ts";

const EVENTS: FileSystemEventType[] = ["file:updated", "fs:reloaded"];

/**
 * An editor buffer that follows writes made elsewhere — this tab's inspector
 * setting a label, an agent, or another tab — while it has nothing unsaved.
 * Without this, an editor open here would autosave its old text over that
 * write. Adopting goes through `adopt`, which neither marks the buffer dirty
 * nor runs `onSaved`: that text was not saved by this editor.
 */
export function useFollowedFile(
  file: File,
  options: { onSaved?: (text: string) => void } = {},
): EditorFile {
  const fs = useFileSystem();
  const editor = useEditorFile({ file, onSaved: options.onSaved });
  const { textRef, adopt } = editor;
  const fileId = file.metadata.id;
  // Read when the load resolves, not when the event fired: a keystroke in
  // between makes the buffer the user's again.
  const dirtyRef = useRef(editor.isDirty);
  dirtyRef.current = editor.isDirty;

  useEffect(() => {
    // File-system events are CustomEvents carrying the FileSystemEvent in `detail`.
    const onEvent = (e: Event) => {
      const detail = (e as CustomEvent<FileSystemEvent | undefined>).detail;
      if (!reloadsOn(e.type, detail, fileId) || !fs.exists(fileId)) return;
      fs.loadFile<string>(fileId)
        .then(({ content }) => {
          const args = { fileId, eventFileId: fileId, isDirty: dirtyRef.current, current: textRef.current, stored: content };
          if (shouldAdopt(args)) adopt(content);
        })
        .catch(() => undefined);
    };
    for (const type of EVENTS) fs.addEventListener(type, onEvent);
    return () => {
      for (const type of EVENTS) fs.removeEventListener(type, onEvent);
    };
  }, [fs, fileId, textRef, adopt]);

  return editor;
}
