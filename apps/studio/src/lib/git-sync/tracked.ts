import { MARKER_FILE } from "./marker.ts";

/** Maps a file name to a target type, or null to reject it. */
export type ResolveTracked = (name: string) => string | null;

export type TreeEntry = { path: string; sha: string; type: string };

/** Blobs below `folder` the app tracks; rejected names are reported in `skipped` (relative paths). */
export function selectTracked(
  entries: TreeEntry[],
  folder: string,
  resolve: ResolveTracked,
): { tracked: { relPath: string; sha: string }[]; skipped: string[] } {
  const prefix = folder === "" ? "" : `${folder}/`;
  const tracked: { relPath: string; sha: string }[] = [];
  const skipped: string[] = [];
  for (const e of entries) {
    if (e.type !== "blob" || !e.path.startsWith(prefix)) continue;
    const relPath = e.path.slice(prefix.length);
    if (relPath === MARKER_FILE) continue;
    const name = relPath.slice(relPath.lastIndexOf("/") + 1);
    if (resolve(name) === null) skipped.push(relPath);
    else tracked.push({ relPath, sha: e.sha });
  }
  return { tracked, skipped };
}

export function toRepoPath(folder: string, relPath: string): string {
  return folder === "" ? relPath : `${folder}/${relPath}`;
}
