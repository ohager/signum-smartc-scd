import type { FileSystem } from "@/lib/file-system";

/**
 * The slice of FileSystem this module needs.
 *
 * A `Pick` over the real class rather than a hand-written interface, so the two
 * cannot drift. The import is type-only on purpose: `file-system.ts` builds its
 * singleton at module load and touches `localStorage`, which throws under
 * `bun test` — an erased import keeps this module testable without a DOM.
 */
export type SnapshotSource = Pick<FileSystem, "listFilesRecursive" | "loadFile">;

export interface ProjectSnapshot {
  /** File system path → TypeScript source, awaiting transpilation. */
  tsFiles: Record<string, string>;
  /** File system path → contract source, served to `?raw` imports. */
  rawFiles: Record<string, string>;
}

/** Only `*.test.ts` files are run; other `.ts` files are helpers they import. */
export function isTestEntry(path: string): boolean {
  return path.endsWith(".test.ts");
}

/**
 * Reads everything in a project the runner can use, split by kind.
 *
 * Contents are read eagerly: projects are small, and a run should see one
 * consistent snapshot rather than files shifting underneath it mid-run.
 */
export async function snapshotProject(
  fs: SnapshotSource,
  projectFolderId: string,
): Promise<ProjectSnapshot> {
  const tsFiles: Record<string, string> = {};
  const rawFiles: Record<string, string> = {};

  for (const metadata of fs.listFilesRecursive(projectFolderId)) {
    const path = metadata.path;
    const target = path.endsWith(".ts") ? tsFiles : path.endsWith(".smart.c") ? rawFiles : null;
    if (!target) continue;
    const loaded = await fs.loadFile(metadata.id);
    target[path] = String(loaded.content ?? "");
  }

  return { tsFiles, rawFiles };
}
