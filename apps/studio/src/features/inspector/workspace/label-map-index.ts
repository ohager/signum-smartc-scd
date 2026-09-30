import { parseLabelMap } from "../model/label-map";
import type { IndexedLabelMap } from "../model/resolve-label-map";

/** Every Label Map in the workspace, valid or not — resolution works across projects. */

export interface WorkspaceFiles {
  listFilesRecursive(folderId?: string): { id: string; name: string; path: string }[];
  loadFile<T>(id: string): Promise<{ content: T }>;
}

export const isLabelMapName = (name: string) => name.toLowerCase().endsWith(".labels.json");
export const isWatchlistName = (name: string) => name.toLowerCase().endsWith(".inspect.json");

export async function loadLabelMaps(fs: WorkspaceFiles): Promise<IndexedLabelMap[]> {
  const files = fs.listFilesRecursive().filter((f) => isLabelMapName(f.name));
  return Promise.all(
    files.map(async (f) => {
      const { content } = await fs.loadFile<string>(f.id);
      const parsed = parseLabelMap(typeof content === "string" ? content : "");
      return {
        fileId: f.id,
        path: f.path,
        name: f.name,
        map: parsed.ok ? parsed.value : null,
        errors: parsed.ok ? [] : parsed.errors,
      };
    }),
  );
}
