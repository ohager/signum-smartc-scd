/**
 * Applies a UI edit to an open editor buffer and saves it at once.
 *
 * `onChange` only schedules React's re-render, and the buffer's `textRef`
 * catches up during that render — after `saveNow` has already read it. So
 * the ref is moved here, synchronously, before the save: otherwise the save
 * writes the text from before the edit, and a second click before the
 * re-render edits stale text.
 */

export interface WritableBuffer {
  textRef: { current: string };
  onChange: (value: string | undefined) => void;
  saveNow: () => Promise<void>;
}

export function writeThrough(editor: WritableBuffer, edit: (text: string) => string): Promise<void> {
  const next = edit(editor.textRef.current);
  editor.textRef.current = next;
  editor.onChange(next);
  return editor.saveNow();
}
