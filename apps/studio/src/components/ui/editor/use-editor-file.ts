import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import debounce from "lodash.debounce";
import { toast } from "sonner";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import { downloadBlob } from "@/lib/download.ts";

/**
 * The open buffer of a file: its text, whether it differs from what is
 * stored, and how it gets written back.
 *
 * Every editor grew its own copy of this, and they disagreed in ways that
 * cost work:
 *
 * - SmartC cleared the dirty flag *before* awaiting the write, so a failed
 *   save still looked saved.
 * - SmartC refused to write a file that did not compile, and the scenario
 *   editor one that did not parse — so half-finished work could not be
 *   persisted at all. Validity belongs in the diagnostics, not in the way of
 *   the save button.
 * - SmartC tracked its ⌘S subscribers in a module-global set and unhooked all
 *   of them on every keystroke; the others each used a plain effect.
 * - The test editor had none of it: no save, no dirty marker, and ⌘S fell
 *   through to the browser's own save dialog.
 *
 * Text is written back on its own a short pause after the last keystroke,
 * and again if the editor closes with something pending. Nothing a user
 * typed should depend on their having pressed a button: the workspace lives
 * in this browser, and leaving a file was the way to lose an afternoon.
 */

/** Quiet enough not to write mid-word, short enough to beat a closing tab. */
const AUTOSAVE_PAUSE_MS = 800;

/** Ctrl/⌘+S belongs to the editor, not to the browser's page-save dialog. */
const preventBrowserSave = (e: KeyboardEvent) => {
  if ((e.ctrlKey || e.metaKey) && e.key === "s") {
    e.preventDefault();
  }
};

interface Options {
  file: File;
  /** Runs after a successful write, with the text that was written. */
  onSaved?: (text: string) => void;
}

export interface EditorFile {
  /** Current buffer text. */
  text: string;
  /** Always the current text, for callbacks Monaco captured at mount. */
  textRef: React.RefObject<string>;
  /** Monaco's `onChange` handler. */
  onChange: (value: string | undefined) => void;
  isDirty: boolean;
  /** `silent` writes without the confirmation toast, for saves the user did not ask for. */
  save: (options?: { silent?: boolean }) => Promise<void>;
  /** What the save button and ⌘S call: drops a pending autosave, then writes. */
  saveNow: () => Promise<void>;
  download: () => void;
}

export function useEditorFile({ file, onSaved }: Options): EditorFile {
  const fs = useFileSystem();
  // A file whose content write never landed reads back as undefined, and
  // Monaco turns uncontrolled the moment its value is not a string.
  const [text, setText] = useState(
    typeof file.content === "string" ? file.content : "",
  );
  const textRef = useRef(text);
  textRef.current = text;
  const [isDirty, setIsDirty] = useState(false);

  const save = useCallback(
    async ({ silent = false }: { silent?: boolean } = {}) => {
      const written = textRef.current;
      try {
        await fs.saveFile(file.metadata.id, written);
        // Keystrokes that landed during the await are not saved, so the buffer
        // is only clean if it still holds exactly what went to storage.
        setIsDirty(textRef.current !== written);
        onSaved?.(written);
        if (!silent) toast.success("File saved successfully!");
      } catch (e: any) {
        toast.error("Could not save file: " + e.message);
      }
    },
    [fs, file.metadata.id, onSaved],
  );

  // Autosave reaches for the save of the moment rather than closing over one:
  // the debounced wrapper is built once, so a captured save would go stale.
  const saveRef = useRef(save);
  saveRef.current = save;

  const autosave = useMemo(
    () => debounce(() => void saveRef.current({ silent: true }), AUTOSAVE_PAUSE_MS),
    [],
  );

  const onChange = useCallback(
    (value: string | undefined) => {
      if (value === undefined) return;
      setText(value);
      setIsDirty(true);
      autosave();
    },
    [autosave],
  );

  const saveNow = useCallback(async () => {
    autosave.cancel();
    await save();
  }, [autosave, save]);

  // Closing the file is not a reason to drop what is pending.
  useEffect(() => () => autosave.flush(), [autosave]);

  const download = useCallback(
    () =>
      downloadBlob(
        file.metadata.name,
        new Blob([textRef.current], { type: "text/plain;charset=utf-8" }),
      ),
    [file.metadata.name],
  );

  // Monaco's own Save action dispatches this, because the keybinding it owns
  // cannot see React state. It does not bubble, so the listener must sit on
  // the same target the action dispatches to.
  useEffect(() => {
    // Wrapped: the listener would otherwise hand the DOM event to save() as
    // its options argument.
    const onSaveRequested = () => void saveNow();
    document.addEventListener("editor:save", onSaveRequested);
    return () => document.removeEventListener("editor:save", onSaveRequested);
  }, [saveNow]);

  useEffect(() => {
    window.addEventListener("keydown", preventBrowserSave);
    return () => window.removeEventListener("keydown", preventBrowserSave);
  }, []);

  return { text, textRef, onChange, isDirty, save, saveNow, download };
}
