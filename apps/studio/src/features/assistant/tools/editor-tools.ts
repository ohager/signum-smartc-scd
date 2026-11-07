import type { ToolArgs } from "@smartc-studio/assistant-protocol";
import type { EditorRegistry } from "../editor-registry";
import { AssistantFailure } from "./errors";
import { resolveWorkspacePath, type WorkspaceFs } from "./paths";

const MAX_SELECTION_CHARS = 2000;
const MAX_DIAGNOSTICS = 100;

export interface EditorToolsDeps {
  registry: Pick<EditorRegistry, "active" | "revealWhenReady">;
  /* Injected so the tools stay router-free; the provider passes react-router's navigate. */
  navigate: (path: string, line?: number) => void;
  fs: WorkspaceFs;
}

export function createEditorTools({ registry, navigate, fs }: EditorToolsDeps) {
  return {
    /* Gives "fix this" in the agent's terminal something to point at. */
    get_editor_context(_args: ToolArgs<"get_editor_context">) {
      const editor = registry.active();
      if (!editor) return { file: null, cursor: null, selection: null, diagnostics: [] };
      const selection = editor.getSelection();
      return {
        file: editor.path,
        cursor: editor.getCursor(),
        selection: selection
          ? {
              ...selection,
              text: selection.text.slice(0, MAX_SELECTION_CHARS),
              truncated: selection.text.length > MAX_SELECTION_CHARS,
            }
          : null,
        diagnostics: editor.getDiagnostics().slice(0, MAX_DIAGNOSTICS),
      };
    },

    open_file(args: ToolArgs<"open_file">) {
      const { fileId, projectId } = resolveWorkspacePath(fs, args.path, "read");
      if (!fileId) throw new AssistantFailure("file_not_found", `No file at ${args.path}.`);
      // Registered before navigating: if the editor mounts first, the request is applied on registration.
      if (args.line !== undefined) registry.revealWhenReady(fileId, args.line);
      navigate(`/projects/${projectId}/files/${fileId}`, args.line);
      return { opened: args.path };
    },
  };
}
