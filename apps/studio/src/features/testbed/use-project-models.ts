import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import type { FileSystem } from "@/lib/file-system";
import { ensureModel, planModelSync } from "./model-sync";

export type ProjectModelsFs = Pick<FileSystem, "listFilesRecursive" | "loadFile" | "addEventListener" | "removeEventListener">;

const EVENTS = ["file:*", "folder:*", "fs:reloaded"] as const;

/*
 * Mirrors the project's `.ts` files as Monaco models while the test editor is open, so
 * TypeScript resolves `import … from "./lib"`: no false "Cannot find module", and named
 * imports complete. Follows FileSystem events, so edits from another tab or the assistant
 * show up without a reload. URIs match transpile.ts, which reuses these models.
 */
export function useProjectModels(monaco: typeof Monaco | null, fs: ProjectModelsFs, projectRoot: string, openFilePath: string): void {
  useEffect(() => {
    if (!monaco) return;
    const owned = new Map<string, number>();
    let disposed = false;
    let running = false;
    let pending = false;
    const uriOf = (path: string) => monaco.Uri.parse("file://" + path);

    const listFiles = () => {
      try {
        return fs.listFilesRecursive(projectRoot);
      } catch {
        return []; // the project was deleted
      }
    };

    const reconcileOnce = async () => {
      const files = listFiles();
      const plan = planModelSync(owned, files, openFilePath);
      const byPath = new Map(files.map((file) => [file.path, file]));
      for (const path of [...plan.create, ...plan.update]) {
        const meta = byPath.get(path)!;
        const text = String((await fs.loadFile(meta.id)).content ?? "");
        if (disposed) return;
        // A run may already have created this model (transpile.ts); adopt it instead of creating a duplicate.
        ensureModel(monaco.editor, uriOf(path), text);
        owned.set(path, meta.lastModified);
      }
      for (const path of plan.dispose) {
        monaco.editor.getModel(uriOf(path))?.dispose();
        owned.delete(path);
      }
    };

    /* Serialized: several quick events (an agent writing files) must not create the same model twice. */
    const reconcile = async () => {
      if (running) {
        pending = true;
        return;
      }
      running = true;
      try {
        do {
          pending = false;
          await reconcileOnce().catch(() => {}); // a file that vanished mid-load is picked up by the next event
        } while (pending && !disposed);
      } finally {
        running = false;
      }
    };

    void reconcile();
    const onChange = () => void reconcile();
    for (const event of EVENTS) fs.addEventListener(event, onChange);
    return () => {
      disposed = true;
      for (const event of EVENTS) fs.removeEventListener(event, onChange);
      for (const path of owned.keys()) monaco.editor.getModel(uriOf(path))?.dispose();
      owned.clear();
    };
  }, [monaco, fs, projectRoot, openFilePath]);
}
