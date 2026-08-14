/**
 * "Recently opened files", owned by the file system.
 *
 * The app has no such data of its own — `FileMetadata` carries only
 * `lastModified` — so `FileSystem` keeps a small ring buffer in its metadata
 * blob. Because the file system owns it, deletion prunes the buffer at the
 * source and an entry can never dangle.
 *
 * An entry holds **only the file id and when it was opened**. The display name,
 * type and owning project are resolved live at render (see
 * `hooks/use-recent-files.ts`): storing the name would go stale on rename, and
 * storing the project id would go stale when a file is dragged to another
 * folder — both of which the app supports.
 *
 * The pure functions below hold all the logic; `RecentFiles` binds them to a
 * host. Same shape as `FileTransfer`, which `FileSystem` composes via
 * `get transfer()`.
 */

/** One entry in the buffer. */
export interface RecentEntry {
  fileId: string;
  openedAt: number;
}

export const RECENTS_LIMIT = 8;

/** The slice of `FileSystem` this service needs. */
export interface RecentsHost {
  getRecents(): readonly RecentEntry[];
  /** Replaces the buffer and persists it. */
  setRecents(recents: RecentEntry[]): void;
  exists(fileId: string): boolean;
}

function isRecentEntry(value: unknown): value is RecentEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Record<string, unknown>;
  return (
    typeof entry.fileId === "string" &&
    entry.fileId.length > 0 &&
    typeof entry.openedAt === "number"
  );
}

/**
 * Hydration guard for the persisted field. Returns `[]` for absent or non-array
 * input and drops individual malformed entries.
 *
 * This runs while `FileSystem` is being constructed, so it must never throw: a
 * corrupt recents field cannot be allowed to take down the whole workspace.
 * An absent field is indistinguishable from an empty buffer, which is why
 * adding recents needs no metadata migration.
 */
export function sanitizeRecents(value: unknown): RecentEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecentEntry).slice(0, RECENTS_LIMIT);
}

/** `fileId` moved to the front, deduped and capped. Does not mutate the input. */
export function addRecent(
  recents: readonly RecentEntry[],
  fileId: string,
  openedAt: number,
): RecentEntry[] {
  const others = recents.filter((entry) => entry.fileId !== fileId);
  return [{ fileId, openedAt }, ...others].slice(0, RECENTS_LIMIT);
}

/** Drops entries whose file no longer exists. */
export function pruneRecents(
  recents: readonly RecentEntry[],
  exists: (fileId: string) => boolean,
): RecentEntry[] {
  return recents.filter((entry) => exists(entry.fileId));
}

/** Recently-opened-files service, composed into `FileSystem` as `fs.recents`. */
export class RecentFiles {
  constructor(private readonly host: RecentsHost) {}

  /**
   * The buffer, newest first. Deletion already prunes at the source, so this
   * filter is a safety net; it writes back only when it actually removed
   * something, to avoid a pointless save on every read.
   */
  list(): RecentEntry[] {
    const current = this.host.getRecents();
    const pruned = pruneRecents(current, (fileId) => this.host.exists(fileId));
    if (pruned.length !== current.length) this.host.setRecents(pruned);
    return pruned;
  }

  record(fileId: string, openedAt: number): void {
    this.host.setRecents(addRecent(this.host.getRecents(), fileId, openedAt));
  }

  /** Removes an entry — called by the file system's deletion paths. */
  forget(fileId: string): void {
    const current = this.host.getRecents();
    if (!current.some((entry) => entry.fileId === fileId)) return;
    this.host.setRecents(current.filter((entry) => entry.fileId !== fileId));
  }
}
