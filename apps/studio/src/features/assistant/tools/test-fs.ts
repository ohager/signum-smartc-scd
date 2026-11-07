import { FileSystem } from "@/lib/file-system/file-system";
import type { ContentStore, MetadataStorage } from "@/lib/file-system/content-store";

/*
 * In-memory stores, copied from file-system-mutations.test.ts: that file keeps
 * them private, and the assistant's tests need a real FileSystem per test without
 * IndexedDB or localStorage.
 */

export class MemoryStorage implements MetadataStorage {
  private readonly entries = new Map<string, string>();
  private readonly watchers = new Map<string, ((raw: string) => void)[]>();

  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
  watch(key: string, onChange: (raw: string) => void) {
    const forKey = this.watchers.get(key) ?? [];
    forKey.push(onChange);
    this.watchers.set(key, forKey);
    return () => {
      this.watchers.set(
        key,
        (this.watchers.get(key) ?? []).filter((w) => w !== onChange),
      );
    };
  }
  writeFromAnotherTab(key: string, value: string) {
    this.entries.set(key, value);
    for (const w of this.watchers.get(key) ?? []) w(value);
  }
}

export class MemoryContent implements ContentStore {
  readonly entries = new Map<string, unknown>();
  async get<T>(fileId: string) {
    return this.entries.get(fileId) as T | undefined;
  }
  async put<T>(fileId: string, content: T) {
    this.entries.set(fileId, content);
  }
  async delete(fileId: string) {
    this.entries.delete(fileId);
  }
}

export function createTestFs() {
  const storage = new MemoryStorage();
  const content = new MemoryContent();
  return { fs: new FileSystem(storage, content), storage, content };
}
