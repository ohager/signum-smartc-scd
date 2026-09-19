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
let storage: MemoryStorage;

beforeEach(() => {
  content = new MemoryContent();
  storage = new MemoryStorage();
  fs = new FileSystem(storage, content);
});

/** The workspace as it would be found after a reload. */
const persisted = () => JSON.parse(storage.getItem("scd:fs-metadata")!);

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

describe("consistency between metadata and content", () => {
  it("does not register a file whose content could not be stored", async () => {
    const folder = await fs.createFolder(fs.rootFolderId, "project");
    content.put = async () => {
      throw new Error("QuotaExceededError");
    };

    await fs.addFile(folder, "counter.smart.c", "smartc", "code").catch(() => {});

    // A listed file with no content reads back as undefined, which every
    // editor then hands to Monaco as its value.
    expect(fs.listFolderContents(folder).files).toEqual([]);
  });

  it("has already persisted the deletion when it announces one", async () => {
    const folder = await fs.createFolder(fs.rootFolderId, "project");
    const fileId = await fs.addFile(folder, "counter.smart.c", "smartc", "code");

    let storedWhenAnnounced: string[] = [];
    fs.addEventListener("file:deleted", () => {
      storedWhenAnnounced = persisted().folderContents[folder].files;
    });

    await fs.deleteFile(fileId);

    expect(storedWhenAnnounced).toEqual([]);
  });
  it("announces a folder's files as deleted only once the workspace is written", async () => {
    const folder = await fs.createFolder(fs.rootFolderId, "project");
    await fs.addFile(folder, "counter.smart.c", "smartc", "code");

    let storedWhenAnnounced: Record<string, unknown> = {};
    fs.addEventListener("file:deleted", () => {
      storedWhenAnnounced = persisted().files;
    });

    await fs.deleteFolder(folder);

    expect(storedWhenAnnounced).toEqual({});
  });
});

describe("name collisions", () => {
  it("refuses to add a second file with the same name to a folder", async () => {
    const folder = await fs.createFolder(fs.rootFolderId, "project");
    await fs.addFile(folder, "counter.smart.c", "smartc", "first");

    expect(fs.addFile(folder, "counter.smart.c", "smartc", "second")).rejects.toThrow(
      "A file named counter.smart.c already exists in this folder",
    );
  });

  it("refuses to rename a file onto a sibling's name", async () => {
    const folder = await fs.createFolder(fs.rootFolderId, "project");
    await fs.addFile(folder, "taken.smart.c", "smartc", "first");
    const fileId = await fs.addFile(folder, "mine.smart.c", "smartc", "second");

    expect(fs.renameFile(fileId, "taken.smart.c")).rejects.toThrow(
      "A file named taken.smart.c already exists in this folder",
    );
  });

  it("allows renaming a file to the name it already has", async () => {
    const folder = await fs.createFolder(fs.rootFolderId, "project");
    const fileId = await fs.addFile(folder, "same.smart.c", "smartc", "code");

    await fs.renameFile(fileId, "same.smart.c");

    expect(fs.getFileMetadata(fileId)!.name).toBe("same.smart.c");
  });

  it("refuses to move a file into a folder that already has that name", async () => {
    const from = await fs.createFolder(fs.rootFolderId, "from");
    const to = await fs.createFolder(fs.rootFolderId, "to");
    await fs.addFile(to, "counter.smart.c", "smartc", "theirs");
    const fileId = await fs.addFile(from, "counter.smart.c", "smartc", "mine");

    expect(fs.moveFile(fileId, to)).rejects.toThrow(
      "A file named counter.smart.c already exists in this folder",
    );
  });

  it("leaves a rejected move entirely untouched", async () => {
    const from = await fs.createFolder(fs.rootFolderId, "from");
    const to = await fs.createFolder(fs.rootFolderId, "to");
    await fs.addFile(to, "counter.smart.c", "smartc", "theirs");
    const fileId = await fs.addFile(from, "counter.smart.c", "smartc", "mine");

    await fs.moveFile(fileId, to).catch(() => {});

    expect(fs.getFolderIdOfFile(fileId)).toBe(from);
    expect(fs.getFileMetadata(fileId)!.path).toBe("/from/counter.smart.c");
  });

  it("refuses to create a second folder with the same name in one parent", async () => {
    const parent = await fs.createFolder(fs.rootFolderId, "project");
    await fs.createFolder(parent, "tests");

    expect(fs.createFolder(parent, "tests")).rejects.toThrow(
      "A folder named tests already exists here",
    );
  });
});

describe("createFolder", () => {
  it("creates the folder inside the folder it is given, not the first one sharing its path", async () => {
    // Sibling names are unique now, but workspaces written before that guard
    // can still hold two projects called the same — and then their paths are
    // identical, so a path cannot identify a parent.
    const storage = new MemoryStorage();
    storage.setItem(
      "scd:fs-metadata",
      JSON.stringify({
        files: {},
        folders: {
          root: { id: "root", name: "@@Root", path: "/", createdAt: 0, lastModified: 0 },
          a: { id: "a", name: "demo", path: "/demo", createdAt: 0, lastModified: 0 },
          b: { id: "b", name: "demo", path: "/demo", createdAt: 0, lastModified: 0 },
        },
        folderContents: {
          root: { files: [], folders: ["a", "b"] },
          a: { files: [], folders: [] },
          b: { files: [], folders: [] },
        },
        rootFolder: "root",
        recentFiles: [],
      }),
    );
    const loaded = new FileSystem(storage, new MemoryContent());

    const child = await loaded.createFolder("b", "tests");

    expect(loaded.listFolderContents("b").folders.map((f) => f.id)).toEqual([child]);
    expect(loaded.listFolderContents("a").folders).toEqual([]);
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
  it("starts a usable workspace when the stored metadata is not readable", () => {
    const storage = new MemoryStorage();
    storage.setItem("scd:fs-metadata", "{ this is not json");

    const loaded = new FileSystem(storage, new MemoryContent());

    expect(loaded.rootFolderId).not.toBe("");
    expect(loaded.listFolderContents().folders).toEqual([]);
  });

  it("keeps the unreadable blob aside instead of overwriting it", () => {
    const storage = new MemoryStorage();
    storage.setItem("scd:fs-metadata", "{ this is not json");

    new FileSystem(storage, new MemoryContent());

    expect(storage.getItem("scd:fs-metadata-unreadable")).toBe("{ this is not json");
  });

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
