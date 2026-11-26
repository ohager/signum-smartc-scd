export type ImportSuggestionKind = "folder" | "module" | "contract";

export interface ImportSuggestion {
  label: string;
  insertText: string;
  kind: ImportSuggestionKind;
}

const segments = (path: string) => path.split("/").filter(Boolean);
const byLabel = (a: ImportSuggestion, b: ImportSuggestion) => (a.label < b.label ? -1 : a.label > b.label ? 1 : 0);

/* What a relative import may point at: `.ts` modules without extension, contracts as raw text. */
function fileSuggestion(name: string): ImportSuggestion | null {
  if (name.endsWith(".smart.c")) return { label: `${name}?raw`, insertText: `${name}?raw`, kind: "contract" };
  if (name.endsWith(".ts")) {
    const module = name.slice(0, -".ts".length);
    return { label: module, insertText: module, kind: "module" };
  }
  return null;
}

/*
 * The direct children of the folder a relative specifier resolves to, as the test editor
 * offers them: folders first, then files, each sorted by label. The partial last segment
 * is left to Monaco's filtering. Never above the open file's project, never another project.
 */
export function importSuggestions(openFilePath: string, typed: string, workspacePaths: string[]): ImportSuggestion[] {
  if (!typed.startsWith("./") && !typed.startsWith("../")) return [];

  const folder = segments(openFilePath).slice(0, -1);
  // Not inside a project: "./" would list every project.
  if (folder.length === 0) return [];
  for (const segment of segments(typed.slice(0, typed.lastIndexOf("/") + 1))) {
    if (segment === ".") continue;
    if (segment === "..") {
      // The first segment is the project; popping it would leave the project.
      if (folder.length <= 1) return [];
      folder.pop();
    } else folder.push(segment);
  }

  const folders = new Set<string>();
  const files: ImportSuggestion[] = [];
  for (const path of workspacePaths) {
    if (path === openFilePath) continue;
    const segs = segments(path);
    if (segs.length <= folder.length || folder.some((s, i) => segs[i] !== s)) continue;
    if (segs.length > folder.length + 1) folders.add(segs[folder.length]!);
    else {
      const suggestion = fileSuggestion(segs[folder.length]!);
      if (suggestion) files.push(suggestion);
    }
  }

  const folderSuggestions = [...folders].map((name): ImportSuggestion => ({ label: `${name}/`, insertText: `${name}/`, kind: "folder" }));
  return [...folderSuggestions.sort(byLabel), ...files.sort(byLabel)];
}
