import { SUPPORTED_FORMAT } from "@/lib/git-sync/marker";
import type { RepoProbe } from "./sync-service";

const isBelow = (path: string, folder: string) => folder === "" || path.startsWith(`${folder}/`);

type Probe = Pick<RepoProbe, "markers" | "nested">;

/** Marker folders that take part in a nesting, outer and inner alike; none of them can be imported. */
export function nestedMarkerFolders(probe: Probe): string[] {
  const folders = probe.markers.map((m) => m.folder);
  const outer = folders.filter((f) => folders.some((g) => g !== f && isBelow(g, f)));
  return [...new Set([...outer, ...probe.nested])].sort();
}

/** Marker folders `importProject` accepts: a valid marker of a supported format, not nested. */
export function importableFolders(probe: Probe): string[] {
  const nested = new Set(nestedMarkerFolders(probe));
  return probe.markers
    .filter((m) => m.marker && m.marker.format <= SUPPORTED_FORMAT && !nested.has(m.folder))
    .map((m) => m.folder);
}
