import { getDb, IdbStores } from "./idb";

export async function saveFileData(fileId: string, content: object) {
  const db = await getDb();
  return db.put(IdbStores.FileData, content, fileId);
}

export async function readFileData(fileId: string) {
  const db = await getDb();
  return db.get(IdbStores.FileData, fileId);
}

export async function deleteFileData(fileId: string) {
  const db = await getDb();
  return db.delete(IdbStores.FileData, fileId);
}
