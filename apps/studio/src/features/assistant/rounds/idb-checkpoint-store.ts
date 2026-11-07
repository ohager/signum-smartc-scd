import { openDB, type IDBPDatabase } from "idb";
import type { Checkpoint, CheckpointStore } from "./checkpoints";

const DB_NAME = "scd-assistant";
const DB_VERSION = 1;
const STORE = "checkpoints";

/* Its own database, so the assistant never forces a version bump on the file system's. */
export class IdbCheckpointStore implements CheckpointStore {
  private db: IDBPDatabase | null = null;

  private async open(): Promise<IDBPDatabase> {
    this.db ??= await openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" }).createIndex("projectId", "projectId");
        }
      },
    });
    return this.db;
  }

  async put(cp: Checkpoint): Promise<void> {
    await (await this.open()).put(STORE, cp);
  }

  async get(id: string): Promise<Checkpoint | undefined> {
    return (await (await this.open()).get(STORE, id)) as Checkpoint | undefined;
  }

  async list(projectId: string): Promise<Checkpoint[]> {
    const all = (await (await this.open()).getAllFromIndex(STORE, "projectId", projectId)) as Checkpoint[];
    return all.sort((a, b) => b.createdAt - a.createdAt);
  }

  async prune(projectId: string, keep: number): Promise<void> {
    const db = await this.open();
    for (const old of (await this.list(projectId)).slice(keep)) await db.delete(STORE, old.id);
  }
}
