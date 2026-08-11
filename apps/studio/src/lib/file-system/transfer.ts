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

// --- Internal path/name helpers (kept local so the lib stays decoupled) ----

function baseName(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? "" : path.slice(0, i);
}

/**
 * Return a name not present in `existing`, inserting -2, -3, … before the
 * (possibly compound, e.g. `.smart.c`) extension. Splits on the first dot.
 */
function uniqueNameIn(name: string, existing: Iterable<string>): string {
  const set = new Set(existing);
  if (!set.has(name)) return name;
  const dot = name.indexOf(".");
  const stem = dot === -1 ? name : name.slice(0, dot);
  const ext = dot === -1 ? "" : name.slice(dot);
  let candidate = name;
  for (let n = 2; set.has(candidate); n++) candidate = `${stem}-${n}${ext}`;
  return candidate;
}

// --- Orchestration over the injected fs collaborator ----------------------

export class FileTransfer {
  constructor(private readonly fs: TransferFs) {}

  /** Collect every file under `folderId` as entries with paths relative to it. */
  async collectFolderEntries(folderId: string): Promise<TransferEntry[]> {
    const entries: TransferEntry[] = [];
    const walk = async (id: string, prefix: string): Promise<void> => {
      const { folders, files } = this.fs.listFolderContents(id);
      for (const f of files) {
        const { content } = await this.fs.loadFile<unknown>(f.id);
        entries.push({
          path: prefix ? `${prefix}/${f.metadata.name}` : f.metadata.name,
          content: typeof content === "string" ? content : String(content ?? ""),
        });
      }
      for (const sub of folders) {
        await walk(
          sub.id,
          prefix ? `${prefix}/${sub.metadata.name}` : sub.metadata.name,
        );
      }
    };
    await walk(folderId, "");
    return entries;
  }

  /** ZIP of the whole subtree under `folderId`. */
  async exportFolderZip(folderId: string): Promise<Uint8Array> {
    return buildZip(await this.collectFolderEntries(folderId));
  }

  /**
   * Import `entries` into `targetFolderId`: entries rejected by either gate —
   * binary (content === null) or wrong extension (resolveType → null) — are
   * skipped, needed subfolders are created (reusing existing ones by name), and
   * each surviving file is added with a name unique in its folder.
   */
  async importEntries(
    targetFolderId: string,
    entries: ImportEntry[],
    resolveType: ResolveType,
  ): Promise<ImportResult> {
    // Two gates: real text (content !== null) AND accepted extension.
    const accepted = entries.filter(
      (e) => e.content !== null && resolveType(baseName(e.path)) !== null,
    ) as { path: string; content: string }[];
    const skipped = entries.length - accepted.length;

    // Resolve every needed directory path to a folder id (parent-first).
    const dirIds = new Map<string, string>([["", targetFolderId]]);
    for (const dir of dirsForEntries(accepted.map((e) => e.path))) {
      const parent = parentDir(dir);
      const name = baseName(dir);
      const parentId = dirIds.get(parent)!;
      const existing = this.fs
        .listFolderContents(parentId)
        .folders.find((f) => f.metadata.name === name);
      const id = existing
        ? existing.id
        : await this.fs.createFolder(this.fs.getFolder(parentId).path, name);
      dirIds.set(dir, id);
    }

    let imported = 0;
    for (const e of accepted) {
      const name = baseName(e.path);
      const type = resolveType(name)!;
      const folderId = dirIds.get(parentDir(e.path))!;
      const existingNames = this.fs
        .listFolderContents(folderId)
        .files.map((f) => f.metadata.name);
      await this.fs.addFile(folderId, uniqueNameIn(name, existingNames), type, e.content);
      imported++;
    }

    return { imported, skipped };
  }

  /** Import a ZIP archive into `targetFolderId`. */
  async importZip(
    targetFolderId: string,
    bytes: Uint8Array,
    resolveType: ResolveType,
  ): Promise<ImportResult> {
    return this.importEntries(targetFolderId, parseZip(bytes), resolveType);
  }
}
