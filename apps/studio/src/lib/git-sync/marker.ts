export const MARKER_FILE = ".smartc-studio";
export const SUPPORTED_FORMAT = 1;

export type Marker = { format: number; [key: string]: unknown };

export type ParseMarkerResult = { ok: true; marker: Marker } | { ok: false; error: string };

export function parseMarker(text: string): ParseMarkerResult {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: "Marker is not valid JSON" };
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    return { ok: false, error: "Marker must be a JSON object" };
  }
  const format = (data as { format?: unknown }).format;
  if (typeof format !== "number" || !Number.isInteger(format)) {
    return { ok: false, error: "Marker needs an integer \"format\"" };
  }
  return { ok: true, marker: data as Marker };
}

export function serializeMarker(marker: Marker): string {
  return `${JSON.stringify(marker, null, 2)}\n`;
}

export function markerPath(folder: string): string {
  return folder === "" ? MARKER_FILE : `${folder}/${MARKER_FILE}`;
}

/** Folders holding a marker (sorted) and those lying below another marker folder. */
export function findMarkerFolders(paths: string[]): { folders: string[]; nested: string[] } {
  const folders = paths
    .filter((p) => p === MARKER_FILE || p.endsWith(`/${MARKER_FILE}`))
    .map((p) => p.slice(0, Math.max(0, p.length - MARKER_FILE.length - 1)))
    .sort();
  const nested = folders.filter((f) =>
    folders.some((o) => o !== f && (o === "" || f.startsWith(`${o}/`))),
  );
  return { folders, nested };
}
