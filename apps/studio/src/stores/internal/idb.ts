import { openDB, type IDBPDatabase } from "idb";

const DB_NAME = "signum-studio-sdc";

export enum IdbStores {
  FileData = "file-data",
}

export async function getDb(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(IdbStores.FileData)) {
        db.createObjectStore(IdbStores.FileData);
      }
      // Add more stores as needed
      // if (!db.objectStoreNames.contains('another-store')) {
      //   db.createObjectStore('another-store');
      // }
    },
  });
}
