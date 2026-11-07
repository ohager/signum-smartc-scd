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

/* Inclusive 1-based lines; the editor flashes a list of these briefly after a reveal. */
export interface LineRange {
  from: number;
  to: number;
}

export interface EditorEntry {
  fileId: string;
  path: string;
  getCursor(): Position;
  getSelection(): EditorSelection | null;
  getDiagnostics(): EditorDiagnostic[];
  reveal(line: number, highlight?: LineRange[]): void;
}

export function createEditorRegistry() {
  const entries = new Map<string, EditorEntry>();
  /* Focus history, oldest first: when the focused editor unmounts, the previous one answers. */
  let focusOrder: string[] = [];
  /* Registration order, oldest first: the answer for "which editor?" when nothing was ever focused. */
  let registered: string[] = [];
  let pending: { fileId: string; line: number; highlight?: LineRange[] } | null = null;

  return {
    register(entry: EditorEntry): () => void {
      entries.set(entry.fileId, entry);
      registered = [...registered.filter((id) => id !== entry.fileId), entry.fileId];
      /* A request belongs to one navigation; if another file's editor mounts first, the user went elsewhere. */
      const request = pending;
      pending = null;
      if (request && request.fileId === entry.fileId) entry.reveal(request.line, request.highlight);
      return () => {
        // A remount registers the new editor before the old one unregisters; only remove our own entry.
        if (entries.get(entry.fileId) === entry) {
          entries.delete(entry.fileId);
          registered = registered.filter((id) => id !== entry.fileId);
        }
      };
    },

    setActive(fileId: string | null): void {
      if (fileId === null) {
        focusOrder = [];
        registered = [];
        return;
      }
      focusOrder = [...focusOrder.filter((id) => id !== fileId), fileId];
    },

    active(): EditorEntry | null {
      for (let i = focusOrder.length - 1; i >= 0; i--) {
        const found = entries.get(focusOrder[i]!);
        if (found) return found;
      }
      /* Nothing focused (e.g. right after a tree click): the newest mounted editor is the one in view. */
      for (let i = registered.length - 1; i >= 0; i--) {
        const found = entries.get(registered[i]!);
        if (found) return found;
      }
      return null;
    },

    /* Reveals now if the file's editor is mounted, otherwise when it registers. One request at a time. */
    revealWhenReady(fileId: string, line: number, highlight?: LineRange[]): void {
      const found = entries.get(fileId);
      if (found) {
        pending = null;
        found.reveal(line, highlight);
      } else {
        pending = { fileId, line, highlight };
      }
    },

    /* A navigation without a line replaces any older request, so it cannot fire on a later visit. */
    cancelReveal(): void {
      pending = null;
    },
  };
}

export type EditorRegistry = ReturnType<typeof createEditorRegistry>;

/* The app-wide instance; tests build their own with createEditorRegistry(). */
export const editorRegistry: EditorRegistry = createEditorRegistry();
