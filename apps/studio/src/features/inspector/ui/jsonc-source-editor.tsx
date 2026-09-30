import Editor, { type OnMount } from "@monaco-editor/react";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { EDITOR_SCROLLBAR, registerClimateThemes } from "@/theme/monaco-themes";
import { registerEditorFileActions } from "@/components/ui/editor/file-actions.tsx";
import type { EditorFile } from "@/components/ui/editor/use-editor-file.ts";
import { registerStudioJson } from "../monaco/register-json";

/**
 * The raw-text view of a watchlist or Label Map. The model's `path` is the
 * file's workspace path, which is what the registered schemas' `fileMatch`
 * patterns see — that is how completion and validation find the right schema.
 */
export function JsoncSourceEditor({
  editor,
  path,
  onMount,
}: {
  editor: EditorFile;
  path: string;
  onMount?: Parameters<OnMount>[0] extends infer E ? (editor: E) => void : never;
}) {
  const monacoTheme = useMonacoTheme("json");
  return (
    <div className="min-h-0 flex-1 rounded">
      <Editor
        height="100%"
        path={path}
        defaultLanguage="json"
        value={editor.text}
        theme={monacoTheme}
        onChange={editor.onChange}
        beforeMount={(monaco) => {
          registerClimateThemes(monaco);
          registerStudioJson(monaco);
        }}
        onMount={(instance, monaco) => {
          registerEditorFileActions(instance, monaco, { onDownload: editor.download });
          onMount?.(instance);
        }}
        options={{
          minimap: { enabled: false },
          scrollbar: EDITOR_SCROLLBAR,
          fontSize: 14,
          scrollBeyondLastLine: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
