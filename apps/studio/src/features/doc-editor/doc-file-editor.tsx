import Editor, { type OnMount } from "@monaco-editor/react";
import { SurfaceToolbar } from "@/components/ui/surface-toolbar.tsx";
import {
  EditorFileActions,
  registerEditorFileActions,
} from "@/components/ui/editor/file-actions.tsx";
import { useFollowedFile } from "@/components/ui/editor/use-followed-file.ts";
import { useMonacoTheme } from "@/theme/use-monaco-theme";
import { registerClimateThemes, EDITOR_SCROLLBAR } from "@/theme/monaco-themes";
import {
  useAssistantEditor,
  useEditorHandles,
} from "@/features/assistant/ui/use-assistant-editor";
import type { File } from "@/lib/file-system";

interface Props {
  file: File;
}

/**
 * Markdown source in Monaco: syntax highlighting and word wrap, no preview.
 * Saving, locking during assistant rounds and follow mode come from
 * `useFollowedFile`; Markdown has no diagnostics, so nothing lints here.
 */
export function DocFileEditor({ file }: Props) {
  const monacoTheme = useMonacoTheme();
  const { text, isDirty, onChange, saveNow, download } = useFollowedFile(file);
  const assistant = useEditorHandles();
  useAssistantEditor({ ...assistant, file });

  const onMount: OnMount = (editor, monaco) => {
    assistant.capture(editor, monaco);
    registerEditorFileActions(editor, monaco, { onDownload: download });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <SurfaceToolbar
        readout={
          <EditorFileActions isDirty={isDirty} onSave={saveNow} onDownload={download} />
        }
      />
      <div className="min-h-0 flex-1">
        <Editor
          height="100%"
          language="markdown"
          path={"file://" + file.metadata.path}
          theme={monacoTheme}
          value={text}
          onChange={onChange}
          beforeMount={registerClimateThemes}
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            scrollbar: EDITOR_SCROLLBAR,
            fontSize: 13,
            scrollBeyondLastLine: false,
            wordWrap: "on",
          }}
        />
      </div>
    </div>
  );
}
