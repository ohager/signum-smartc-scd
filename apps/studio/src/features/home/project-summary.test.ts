import { describe, it, expect } from "bun:test";
import { summarizeProject, summarizeProjects, type SummaryFs } from "./project-summary";

interface FakeFile {
  id: string;
  name: string;
  type: string;
  lastModified: number;
}

interface FakeFolder {
  name: string;
  lastModified: number;
  folders: string[];
  files: FakeFile[];
}

/** In-memory `SummaryFs`, mirroring the fake FS style of `transfer.test.ts`. */
function fakeFs(folders: Record<string, FakeFolder>, rootFolders: string[]): SummaryFs {
  return {
    getFolder: (folderId) => {
      const folder = folders[folderId];
      if (!folder) throw new Error(`Folder not found: ${folderId}`);
      return { name: folder.name, lastModified: folder.lastModified };
    },
    listFolderContents: (folderId) => {
      if (folderId === undefined) {
        return { folders: rootFolders.map((id) => ({ id })), files: [] };
      }
      const folder = folders[folderId];
      if (!folder) throw new Error(`Folder not found: ${folderId}`);
      return {
        folders: folder.folders.map((id) => ({ id })),
        files: folder.files.map((f) => ({ id: f.id, metadata: f })),
      };
    },
  };
}

const smartc = (id: string, name: string, lastModified: number): FakeFile => ({
  id,
  name,
  type: "smartc",
  lastModified,
});

const scenario = (id: string, name: string, lastModified: number): FakeFile => ({
  id,
  name,
  type: "scenario",
  lastModified,
});

describe("summarizeProject", () => {
  it("counts files across nested folders and takes the newest lastModified", () => {
    const fs = fakeFs(
      {
        p: { name: "vault", lastModified: 5, folders: ["sub"], files: [smartc("f1", "vault.smart.c", 10)] },
        sub: { name: "sub", lastModified: 5, folders: [], files: [scenario("f2", "a.scenario.json", 40)] },
      },
      ["p"],
    );
    const summary = summarizeProject(fs, "p");
    expect(summary.id).toBe("p");
    expect(summary.name).toBe("vault");
    expect(summary.fileCount).toBe(2);
    expect(summary.lastModified).toBe(40);
  });

  it("picks the newest .smart.c as the main file", () => {
    const fs = fakeFs(
      {
        p: {
          name: "vault",
          lastModified: 1,
          folders: [],
          files: [smartc("old", "a.smart.c", 5), smartc("new", "b.smart.c", 9)],
        },
      },
      ["p"],
    );
    expect(summarizeProject(fs, "p").mainFileId).toBe("new");
  });

  it("prefers a .smart.c over a newer file of another type", () => {
    const fs = fakeFs(
      {
        p: {
          name: "vault",
          lastModified: 1,
          folders: [],
          files: [smartc("contract", "a.smart.c", 5), scenario("sc", "a.scenario.json", 99)],
        },
      },
      ["p"],
    );
    expect(summarizeProject(fs, "p").mainFileId).toBe("contract");
  });

  it("finds a .smart.c nested in a subfolder", () => {
    const fs = fakeFs(
      {
        p: { name: "vault", lastModified: 1, folders: ["sub"], files: [] },
        sub: { name: "src", lastModified: 1, folders: [], files: [smartc("deep", "a.smart.c", 3)] },
      },
      ["p"],
    );
    expect(summarizeProject(fs, "p").mainFileId).toBe("deep");
  });

  it("falls back to the newest file of any type when there is no .smart.c", () => {
    const fs = fakeFs(
      {
        p: {
          name: "vault",
          lastModified: 1,
          folders: [],
          files: [scenario("s1", "a.scenario.json", 2), scenario("s2", "b.scenario.json", 7)],
        },
      },
      ["p"],
    );
    expect(summarizeProject(fs, "p").mainFileId).toBe("s2");
  });

  it("reports an empty project with a null main file and the folder's own timestamp", () => {
    const fs = fakeFs({ p: { name: "empty", lastModified: 42, folders: [], files: [] } }, ["p"]);
    const summary = summarizeProject(fs, "p");
    expect(summary.fileCount).toBe(0);
    expect(summary.mainFileId).toBeNull();
    expect(summary.lastModified).toBe(42);
  });
});

describe("summarizeProjects", () => {
  it("summarizes every root project, newest activity first", () => {
    const fs = fakeFs(
      {
        a: { name: "alpha", lastModified: 1, folders: [], files: [smartc("f1", "a.smart.c", 10)] },
        b: { name: "beta", lastModified: 1, folders: [], files: [smartc("f2", "b.smart.c", 50)] },
      },
      ["a", "b"],
    );
    expect(summarizeProjects(fs).map((p) => p.name)).toEqual(["beta", "alpha"]);
  });

  it("returns an empty list for an empty workspace", () => {
    expect(summarizeProjects(fakeFs({}, []))).toEqual([]);
  });
});
