import type * as Monaco from "monaco-editor";

export interface SyncPlan {
  create: string[];
  update: string[];
  dispose: string[];
}

/*
 * Which mirrored Monaco models to create, refresh or drop so they match the project's
 * `.ts` files. Diffing the whole project each time covers folder renames and moves, which
 * change the path of every file inside, without a special case per event. The open file
 * is left out: its model belongs to the editor.
 */
export function planModelSync(
  owned: ReadonlyMap<string, number>,
  files: ReadonlyArray<{ path: string; lastModified: number }>,
  openFilePath: string,
): SyncPlan {
  const desired = files.filter((file) => file.path.endsWith(".ts") && file.path !== openFilePath);
  const desiredPaths = new Set(desired.map((file) => file.path));
  const plan: SyncPlan = { create: [], update: [], dispose: [] };
  for (const { path, lastModified } of desired) {
    const loadedAt = owned.get(path);
    if (loadedAt === undefined) plan.create.push(path);
    else if (loadedAt !== lastModified) plan.update.push(path);
  }
  for (const path of owned.keys()) if (!desiredPaths.has(path)) plan.dispose.push(path);
  return plan;
}

/*
 * Get-or-create a TypeScript model with this text. Shared by the model mirror and
 * transpileAll, which calls it again right before each emit: an editor closing mid-run
 * disposes its mirrored models, and the run must not fail with "Could not find source file".
 */
export function ensureModel(editor: Pick<typeof Monaco.editor, "getModel" | "createModel">, uri: Monaco.Uri, text: string): void {
  const existing = editor.getModel(uri);
  if (existing) {
    if (existing.getValue() !== text) existing.setValue(text);
  } else editor.createModel(text, "typescript", uri);
}
