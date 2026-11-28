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

/** A folder may hold a marker only if no other marker folder lies above or below it. */
export function canInitialize(probe: Probe, folder: string): boolean {
  return (
    !probe.markers.some((m) => m.folder !== folder && (isBelow(m.folder, folder) || isBelow(folder, m.folder))) &&
    !probe.markers.some((m) => m.folder === folder && m.marker)
  );
}

/** Why a typed folder cannot take a new marker. */
export type NewFolderProblem = "invalid" | "nested" | "file_exists" | "has_marker";

/**
 * A typed folder path as a repo folder: trimmed, one trailing `/` dropped, `""` for the
 * repo root. null for a leading `/`, a `\`, or an empty, `.` or `..` segment.
 */
export function normalizeFolder(input: string): string | null {
  let path = input.trim();
  if (path === "") return "";
  if (path.startsWith("/") || path.includes("\\")) return null;
  if (path.endsWith("/")) path = path.slice(0, -1);
  return path.split("/").some((s) => s === "" || s === "." || s === "..") ? null : path;
}

/** Parent folders of `path`, outermost first, root excluded. */
export function parentFolders(path: string): string[] {
  const out: string[] = [];
  for (let i = path.indexOf("/"); i !== -1; i = path.indexOf("/", i + 1)) out.push(path.slice(0, i));
  return out;
}

/** null if `folder` (normalized) can take a new marker, else the first problem found. */
export function checkNewFolder(
  probe: Pick<RepoProbe, "markers" | "nested" | "pathKind">,
  folder: string,
): NewFolderProblem | null {
  if (normalizeFolder(folder) !== folder) return "invalid";
  if (probe.markers.some((m) => m.folder === folder && m.marker)) return "has_marker";
  if (!canInitialize(probe, folder)) return "nested";
  if (folder !== "" && [...parentFolders(folder), folder].some((p) => probe.pathKind(p) === "blob")) {
    return "file_exists";
  }
  return null;
}

/** A project name as one folder name: lowercase, `-` for spaces, only `[a-z0-9._-]`. */
export function slugFolderName(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");
  return slug || "contract";
}

/**
 * A folder for a new project: next to the first valid marker folder (at the root when that
 * marker sits at the root or in a root-level folder), named after the project; numbered
 * `-2`, `-3`, … while a marker already sits there.
 */
export function suggestNewFolder(probe: Pick<RepoProbe, "markers">, projectName: string): string {
  const first = probe.markers.find((m) => m.marker)?.folder;
  const parent = first ? first.slice(0, Math.max(0, first.lastIndexOf("/"))) : "";
  const base = (parent ? `${parent}/` : "") + slugFolderName(projectName);
  const taken = new Set(probe.markers.map((m) => m.folder));
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base}-${n}`;
  return candidate;
}
