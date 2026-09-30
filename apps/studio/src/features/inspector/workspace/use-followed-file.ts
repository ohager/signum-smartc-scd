import { useEffect } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { useEditorFile, type EditorFile } from "@/components/ui/editor/use-editor-file.ts";
import type { File, FileSystemEvent } from "@/lib/file-system";
import { shouldAdopt } from "./should-adopt";

/**
 * An editor buffer that follows writes made elsewhere while it has nothing
 * unsaved. Without this, a Label Map open here would autosave its old text
 * over a label the inspector just set.
 */
export function useFollowedFile(file: File): EditorFile {
  const fs = useFileSystem();
  const editor = useEditorFile({ file });
  const { isDirty, textRef, adopt } = editor;
  const fileId = file.metadata.id;

  useEffect(() => {
    // File-system events are CustomEvents carrying the FileSystemEvent in `detail`.
    const onUpdated = (e: Event) => {
      const event = (e as CustomEvent<FileSystemEvent>).detail;
      if (event?.id !== fileId || isDirty) return;
      fs.loadFile<string>(fileId)
        .then(({ content }) => {
          const args = { fileId, eventFileId: event.id, isDirty, current: textRef.current, stored: content };
          if (shouldAdopt(args)) adopt(content);
        })
        .catch(() => undefined);
    };
    fs.addEventListener("file:updated", onUpdated);
    return () => fs.removeEventListener("file:updated", onUpdated);
  }, [fs, fileId, isDirty, textRef, adopt]);

  return editor;
}
