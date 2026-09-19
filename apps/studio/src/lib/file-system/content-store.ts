/**
 * Where file *contents* live, separated from where metadata lives.
 *
 * `FileSystem` keeps its metadata in a single localStorage blob and every
 * file's content under its id in IndexedDB. Both were reached through browser
 * globals directly, which is why none of the mutating operations could be
 * tested. They are collaborators now: the app composes the real ones, tests
 * compose in-memory ones — the same shape of seam `FileTransfer` uses.
 */

import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "signum-studio-scd";
const DB_VERSION = 1;
const CONTENT_STORE = "fs-content";

/** The slice of `localStorage` the metadata blob needs. */
export interface MetadataStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Content addressed by file id. `get` resolves undefined for unknown ids. */
export interface ContentStore {
  get<T>(fileId: string): Promise<T | undefined>;
  put<T>(fileId: string, content: T): Promise<void>;
  delete(fileId: string): Promise<void>;
}

/** The real store: one IndexedDB object store, opened on first use. */
export class IdbContentStore implements ContentStore {
  private db: IDBPDatabase | null = null;

  private async open(): Promise<IDBPDatabase> {
    if (this.db) return this.db;

    this.db = await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(CONTENT_STORE)) {
          db.createObjectStore(CONTENT_STORE);
        }
      },
    });

    return this.db;
  }

  async get<T>(fileId: string): Promise<T | undefined> {
    const db = await this.open();
    return (await db.get(CONTENT_STORE, fileId)) as T | undefined;
  }

  async put<T>(fileId: string, content: T): Promise<void> {
    const db = await this.open();
    await db.put(CONTENT_STORE, content, fileId);
  }

  async delete(fileId: string): Promise<void> {
    const db = await this.open();
    await db.delete(CONTENT_STORE, fileId);
  }
}
