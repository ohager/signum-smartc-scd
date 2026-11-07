/*
 * What the assistant can ask the mounted Monaco editors, without importing Monaco:
 * each editor registers a small adapter, and the tools only see that. It also holds
 * the "reveal this line once that file's editor exists" request, because a tool that
 * navigates cannot know whether the target editor is mounted yet.
 */

export interface Position {
  line: number;
  column: number;
}

export interface EditorSelection {
  from: Position;
  to: Position;
  text: string;
}

export interface EditorDiagnostic {
  line: number;
  severity: "error" | "warning" | "info";
  message: string;
  source: string;
}

export interface EditorEntry {
  fileId: string;
  path: string;
  getCursor(): Position;
  getSelection(): EditorSelection | null;
  getDiagnostics(): EditorDiagnostic[];
  reveal(line: number): void;
}

export function createEditorRegistry() {
  const entries = new Map<string, EditorEntry>();
  /* Focus history, oldest first: when the focused editor unmounts, the previous one answers. */
  let focusOrder: string[] = [];
  let pending: { fileId: string; line: number } | null = null;

  return {
    register(entry: EditorEntry): () => void {
      entries.set(entry.fileId, entry);
      if (pending && pending.fileId === entry.fileId) {
        const { line } = pending;
        pending = null;
        entry.reveal(line);
      }
      return () => {
        // A remount registers the new editor before the old one unregisters; only remove our own entry.
        if (entries.get(entry.fileId) === entry) entries.delete(entry.fileId);
      };
    },

    setActive(fileId: string | null): void {
      if (fileId === null) {
        focusOrder = [];
        return;
      }
      focusOrder = [...focusOrder.filter((id) => id !== fileId), fileId];
    },

    active(): EditorEntry | null {
      for (let i = focusOrder.length - 1; i >= 0; i--) {
        const found = entries.get(focusOrder[i]!);
        if (found) return found;
      }
      return null;
    },

    /* Reveals now if the file's editor is mounted, otherwise when it registers. One request at a time. */
    revealWhenReady(fileId: string, line: number): void {
      const found = entries.get(fileId);
      if (found) {
        pending = null;
        found.reveal(line);
      } else {
        pending = { fileId, line };
      }
    },
  };
}

export type EditorRegistry = ReturnType<typeof createEditorRegistry>;

/* The app-wide instance; tests build their own with createEditorRegistry(). */
export const editorRegistry: EditorRegistry = createEditorRegistry();
