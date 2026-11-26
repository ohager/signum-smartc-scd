/**
 * Applies a UI edit to an open editor buffer and saves it at once.
 *
 * `onChange` only schedules React's re-render, and the buffer's `textRef`
 * catches up during that render — after `saveNow` has already read it. So
 * the ref is moved here, synchronously, before the save: otherwise the save
 * writes the text from before the edit, and a second click before the
 * re-render edits stale text.
 */

import { toast } from "sonner";
import { t } from "@/i18n/runtime";

export interface WritableBuffer {
  textRef: { current: string };
  onChange: (value: string | undefined) => void;
  saveNow: () => Promise<void>;
}

/*
 * `isLocked` is the guard for UI writes that never touch Monaco (labels): Monaco's
 * read-only flag cannot stop those, so while an agent works on the file's project
 * they are refused here, before the buffer is touched.
 */
export function writeThrough(
  editor: WritableBuffer,
  edit: (text: string) => string,
  isLocked: () => boolean = () => false,
): Promise<void> {
  if (isLocked()) {
    toast.error(t("assistant.lock.blocked"));
    return Promise.resolve();
  }
  const next = edit(editor.textRef.current);
  editor.textRef.current = next;
  editor.onChange(next);
  return editor.saveNow();
}
