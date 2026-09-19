import { describe, it, expect, beforeEach } from "bun:test";
import { FileSystem } from "./file-system";
import type { ContentStore, MetadataStorage } from "./content-store";

/**
 * The mutating half of the file system: adding, saving, renaming, moving and
 * deleting. `file-system.test.ts` covers the read side against a seeded
 * workspace and must keep using the singleton; these tests build a fresh
 * instance per test over in-memory stores, which is what the constructor's
 * two collaborators are for.
 */

class MemoryStorage implements MetadataStorage {
  private readonly entries = new Map<string, string>();
  getItem(key: string) {
    return this.entries.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.entries.set(key, value);
  }
}

class MemoryContent implements ContentStore {
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

let fs: FileSystem;
let content: MemoryContent;

beforeEach(() => {
  content = new MemoryContent();
  fs = new FileSystem(new MemoryStorage(), content);
});

describe("moveFile", () => {
  it("updates the file's folderId, not only the folder listings", async () => {
    const from = await fs.createFolder(fs.rootFolderId, "from");
    const to = await fs.createFolder(fs.rootFolderId, "to");
    const fileId = await fs.addFile(from, "counter.smart.c", "smartc", "code");

    await fs.moveFile(fileId, to);

    expect(fs.getFileMetadata(fileId)!.folderId).toBe(to);
    expect(fs.getFolderIdOfFile(fileId)).toBe(to);
  });

  it("rewrites the path to sit under the target folder", async () => {
    const from = await fs.createFolder(fs.rootFolderId, "from");
    const to = await fs.createFolder(fs.rootFolderId, "to");
    const fileId = await fs.addFile(from, "counter.smart.c", "smartc", "code");

    await fs.moveFile(fileId, to);

    expect(fs.getFileMetadata(fileId)!.path).toBe("/to/counter.smart.c");
  });
});

describe("renameFile", () => {
  it("keeps folderId pointing at the owning folder", async () => {
    const folder = await fs.createFolder(fs.rootFolderId, "project");
    const fileId = await fs.addFile(folder, "old.smart.c", "smartc", "code");

    await fs.renameFile(fileId, "new.smart.c");

    const meta = fs.getFileMetadata(fileId)!;
    expect(meta.folderId).toBe(folder);
    expect(meta.path).toBe("/project/new.smart.c");
  });
});

describe("createFolder", () => {
  it("creates the folder inside the folder it is given, not the first one sharing its path", async () => {
    // Nothing stops two projects being called the same, and then their paths
    // are identical — so a path can never identify a parent.
    const first = await fs.createFolder(fs.rootFolderId, "demo");
    const second = await fs.createFolder(fs.rootFolderId, "demo");

    const child = await fs.createFolder(second, "tests");

    expect(fs.listFolderContents(second).folders.map((f) => f.id)).toEqual([child]);
    expect(fs.listFolderContents(first).folders).toEqual([]);
  });

  it("builds the child path from the parent it was given", async () => {
    const parent = await fs.createFolder(fs.rootFolderId, "demo");

    const child = await fs.createFolder(parent, "tests");

    expect(fs.getFolder(child).path).toBe("/demo/tests");
  });

  it("rejects an unknown parent", async () => {
    expect(fs.createFolder("nope", "tests")).rejects.toThrow("Parent folder not found: nope");
  });
});

describe("hydration", () => {
  it("repairs a folderId that an earlier move left pointing at the old folder", () => {
    // Exactly what shipped moves wrote: the listings moved, the file's own
    // folderId did not. Reading such a blob must not carry the lie forward.
    const storage = new MemoryStorage();
    storage.setItem(
      "scd:fs-metadata",
      JSON.stringify({
        files: {
          f1: {
            id: "f1",
            folderId: "from",
            name: "counter.smart.c",
            path: "/to/counter.smart.c",
            type: "smartc",
            lastModified: 0,
          },
        },
        folders: {
          root: { id: "root", name: "@@Root", path: "/", createdAt: 0, lastModified: 0 },
          from: { id: "from", name: "from", path: "/from", createdAt: 0, lastModified: 0 },
          to: { id: "to", name: "to", path: "/to", createdAt: 0, lastModified: 0 },
        },
        folderContents: {
          root: { files: [], folders: ["from", "to"] },
          from: { files: [], folders: [] },
          to: { files: ["f1"], folders: [] },
        },
        rootFolder: "root",
        recentFiles: [],
      }),
    );

    const loaded = new FileSystem(storage, new MemoryContent());

    expect(loaded.getFileMetadata("f1")!.folderId).toBe("to");
  });
});
