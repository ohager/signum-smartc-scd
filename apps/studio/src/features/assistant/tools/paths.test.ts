import { describe, it, expect, beforeEach } from "bun:test";
import { resolveWorkspacePath, resolveProject, type WorkspaceFs } from "./paths";
import { AssistantFailure } from "./errors";
import { createTestFs } from "./test-fs";

let fs: WorkspaceFs;
let projectId: string;

beforeEach(async () => {
  const t = createTestFs();
  fs = t.fs;
  projectId = await fs.createFolder(fs.rootFolderId, "p");
  await fs.createFolder(projectId, "src");
  await fs.addFile(projectId, "a.smart.c", "smartc", "x");
});

function code(fn: () => unknown): AssistantFailure {
  try {
    fn();
  } catch (e) {
    expect(e).toBeInstanceOf(AssistantFailure);
    return e as AssistantFailure;
  }
  throw new Error("did not throw");
}

describe("resolveWorkspacePath", () => {
  it("resolves an existing file", () => {
    const r = resolveWorkspacePath(fs, "/p/a.smart.c", "write");
    expect(r.projectId).toBe(projectId);
    expect(r.folderId).toBe(projectId);
    expect(r.name).toBe("a.smart.c");
    expect(r.fileId).not.toBeNull();
  });

  it("resolves a new file in a subfolder that exists, with no file id", () => {
    const r = resolveWorkspacePath(fs, "/p/src/b.ts", "write");
    expect(r.fileId).toBeNull();
    expect(fs.getFolder(r.folderId).name).toBe("src");
  });

  it.each(["/p/../q/a.smart.c", "/p//a.ts", "/p/", "p/a.ts", "/p", "/p/a.ts\\x", "/p/./a.ts", "/"])(
    "rejects %p",
    (path) => {
      expect(code(() => resolveWorkspacePath(fs, path, "read")).code).toBe("path_not_allowed");
    },
  );

  it("rejects a missing parent folder with a hint about folders", () => {
    const e = code(() => resolveWorkspacePath(fs, "/p/missing/a.ts", "write"));
    expect(e.code).toBe("path_not_allowed");
    expect(e.hint).toContain("Folders cannot be created");
  });

  it("allows reading .asm but not writing it", () => {
    expect(resolveWorkspacePath(fs, "/p/a.asm", "read").name).toBe("a.asm");
    expect(code(() => resolveWorkspacePath(fs, "/p/a.asm", "write")).code).toBe("path_not_allowed");
  });

  it("rejects writing .txt", () => {
    expect(code(() => resolveWorkspacePath(fs, "/p/x.txt", "write")).code).toBe("path_not_allowed");
  });

  it.each(["a.smart.c", "a.test.ts", "a.ts", "a.scenario.json", "a.labels.json", "a.inspect.json", "a.md"])(
    "allows writing %s",
    (name) => {
      expect(resolveWorkspacePath(fs, `/p/${name}`, "write").name).toBe(name);
    },
  );

  it("rejects two top-level folders with the same name and says to rename", async () => {
    const t = createTestFs();
    // The file system itself refuses a clash, so build the duplicate through metadata.
    const a = await t.fs.createFolder(t.fs.rootFolderId, "p");
    const b = await t.fs.createFolder(t.fs.rootFolderId, "p2");
    (t.fs as any).metadata.folders[b].name = "p";
    expect(a).not.toBe(b);
    const e = code(() => resolveWorkspacePath(t.fs, "/p/a.ts", "write"));
    expect(e.code).toBe("path_not_allowed");
    expect(e.hint).toContain("rename");
  });

  it("rejects an unknown project", () => {
    expect(code(() => resolveWorkspacePath(fs, "/nope/a.ts", "read")).code).toBe("path_not_allowed");
  });
});

describe("resolveProject", () => {
  it("returns the folder id", () => expect(resolveProject(fs, "p")).toBe(projectId));
  it("rejects unknown names", () => expect(code(() => resolveProject(fs, "q")).code).toBe("path_not_allowed"));
});
