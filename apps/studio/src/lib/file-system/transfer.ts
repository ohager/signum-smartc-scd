import { zipSync, unzipSync } from "fflate";
import type { FileMetadata, FolderMetadata } from "./file-system-types.ts";

/** An exported file entry with a relative, "/"-joined path (content is real text). */
export interface TransferEntry {
  path: string;
  content: string;
}

/** An entry read from an external source; `content` is null if it wasn't decodable text. */
export interface ImportEntry {
  path: string;
  content: string | null;
}

export interface ImportResult {
  imported: number;
  skipped: number;
}

/** Maps a file name to a target type, or null to reject/skip it. */
export type ResolveType = (fileName: string) => string | null;

/**
 * Structural subset of `FileSystem` the transfer service needs. Keeps the
 * service unit-testable with a fake; the real `FileSystem` satisfies it.
 */
export interface TransferFs {
  listFolderContents(folderId?: string): {
    folders: { id: string; metadata: FolderMetadata }[];
    files: { id: string; metadata: FileMetadata }[];
  };
  loadFile<T>(fileId: string): Promise<{ content: T; metadata: FileMetadata }>;
  getFolder(folderId: string): FolderMetadata;
  createFolder(parentPath: string, name: string): Promise<string>;
  addFile<T>(folderId: string, name: string, type: string, content: T): Promise<string>;
}

// --- Pure, stateless, dependency-light transforms -------------------------

/** Build a ZIP archive from text entries (UTF-8 encoded). */
export function buildZip(entries: TransferEntry[]): Uint8Array {
  const enc = new TextEncoder();
  const zippable: Record<string, Uint8Array> = {};
  for (const e of entries) zippable[e.path] = enc.encode(e.content);
  return zipSync(zippable);
}

/**
 * Decode bytes as strict UTF-8 text, or return null if they look binary
 * (contain a NUL byte, or aren't valid UTF-8). The byte→text boundary shared
 * by ZIP parsing and the UI file pickers.
 */
export function decodeTextOrNull(bytes: Uint8Array): string | null {
  for (let i = 0; i < bytes.length; i++) if (bytes[i] === 0) return null;
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Parse a ZIP archive into import entries (binary → content null), skipping dirs. */
export function parseZip(bytes: Uint8Array): ImportEntry[] {
  const unzipped = unzipSync(bytes);
  const entries: ImportEntry[] = [];
  for (const [path, data] of Object.entries(unzipped)) {
    if (path.endsWith("/")) continue; // directory entry
    entries.push({ path, content: decodeTextOrNull(data) });
  }
  return entries;
}

/**
 * The intermediate directories needed for the given file paths: deduped,
 * parent-first (shallow → deep), root excluded.
 */
export function dirsForEntries(paths: string[]): string[] {
  const dirs = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    parts.pop(); // drop the file name
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      dirs.add(acc);
    }
  }
  return [...dirs].sort(
    (a, b) => a.split("/").length - b.split("/").length || a.localeCompare(b),
  );
}
