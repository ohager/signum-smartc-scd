import { useEffect, useRef, useState } from 'react';
import type { EditorState, EditorStateManager } from "@/lib/editor/editor-state-manager.ts";

export function useEditorState<T>(
  editorManager: EditorStateManager<T>,
  fileId?: string
) {
  const [state, setState] = useState<EditorState<T>>(editorManager.getState());
  const managerRef = useRef(editorManager);

  // Load file when fileId changes
  useEffect(() => {
    if (fileId) {
      managerRef.current.loadFile(fileId);
    }
  }, [fileId]);

  // Subscribe to state changes
  useEffect(() => {
    const unsubscribe = managerRef.current.subscribe(setState);
    return () => {
      unsubscribe();
      managerRef.current.dispose();
    };
  }, []);


  return {
    content: state.content,
    isLoading: state.isLoading,
    isDirty: state.isDirty,
    fileInfo: state.fileInfo,
    errors: state.validationErrors,
    isValid: state.validationErrors.length === 0,

    updateContent: (content: T) => managerRef.current.updateContent(content),
    saveContent: () => managerRef.current.saveContent(),
  };
}
