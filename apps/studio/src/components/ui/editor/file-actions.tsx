import type { OnMount } from "@monaco-editor/react";
import { AlignLeft, DownloadIcon, SaveIcon } from "lucide-react";
import { EditorActionButton } from "./actionButton.tsx";

/**
 * File operations shared by every code editor (SmartC, ASM, Scenario).
 *
 * They sit on the right of the surface toolbar as icons, beside the readout:
 * the left slot is for what the surface is *for*, and file operations are
 * housekeeping that works identically everywhere and already has hotkeys.
 */

// Typed off OnMount rather than the `monaco-editor` package: the app resolves
// two copies of it, and their editor types are not mutually assignable.
type CodeEditor = Parameters<OnMount>[0];
type MonacoNamespace = Parameters<OnMount>[1];

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iP(hone|ad|od)/i.test(navigator.userAgent);

/**
 * Save and Download are app-defined; Monaco binds nothing to `S`, so neither
 * shadows a built-in command. Format is Monaco's OWN `editor.action.formatDocument`
 * binding, reused as-is so it can never drift out of sync with the editor.
 */
export const EDITOR_HOTKEYS = {
  save: isMac ? "⌘S" : "Ctrl+S",
  download: isMac ? "⇧⌘S" : "Ctrl+Shift+S",
  format: isMac ? "⇧⌥F" : "Shift+Alt+F",
} as const;

interface Props {
  isDirty: boolean;
  /**
   * Always offered, even while the file has diagnostics: work in progress
   * rarely compiles, and refusing to store it is how it gets lost.
   */
  onSave: () => void;
  onDownload: () => void;
  /** Omit to hide the button for file types that have no formatter yet. */
  onFormat?: () => void;
}

export function EditorFileActions({
  isDirty,
  onSave,
  onDownload,
  onFormat,
}: Props) {
  return (
    <div className="flex items-center gap-1">
      {onFormat && (
        <EditorActionButton
          tooltip={`Format document (${EDITOR_HOTKEYS.format})`}
          onClick={onFormat}
        >
          <AlignLeft />
        </EditorActionButton>
      )}
      <EditorActionButton
        tooltip={`Download this file (${EDITOR_HOTKEYS.download})`}
        onClick={onDownload}
      >
        <DownloadIcon />
      </EditorActionButton>
      <EditorActionButton
        tooltip={
          isDirty ? `Unsaved changes (${EDITOR_HOTKEYS.save})` : "All Saved"
        }
        onClick={() => onSave()}
      >
        <SaveIcon className={isDirty ? "text-[var(--mag)]" : "text-[var(--green)]"} />
      </EditorActionButton>
    </div>
  );
}

/**
 * Registers the keyboard/context-menu counterparts of the buttons above.
 * Call from the editor's `onMount`.
 *
 * `onDownload` must read the current text from a ref: Monaco captures this
 * closure once at mount, so a value captured from render would go stale.
 * Saving goes through the `editor:save` document event instead, which each
 * editor re-subscribes on every change.
 */
export function registerEditorFileActions(
  editor: CodeEditor,
  monaco: MonacoNamespace,
  { onDownload }: { onDownload: () => void },
): void {
  editor.addAction({
    id: "file-save",
    label: "Save File",
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS],
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.5,
    run: () => {
      document.dispatchEvent(new CustomEvent("editor:save"));
    },
  });
  editor.addAction({
    id: "file-download",
    label: "Download File",
    keybindings: [
      monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyS,
    ],
    contextMenuGroupId: "navigation",
    contextMenuOrder: 1.6,
    run: onDownload,
  });
}
