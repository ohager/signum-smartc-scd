import { describe, it, expect, beforeEach } from "bun:test";
import { createWorkspaceTools } from "./workspace-tools";
import { AssistantFailure } from "./errors";
import { createTestFs } from "./test-fs";
import { smartcStarter } from "@/features/project/smartc-starter";
import type { FileSystem } from "@/lib/file-system/file-system";

let fs: FileSystem;
let tools: ReturnType<typeof createWorkspaceTools>;
let p: string;

beforeEach(async () => {
  fs = createTestFs().fs;
  tools = createWorkspaceTools(fs);
  p = await fs.createFolder(fs.rootFolderId, "p");
});

async function failure(promise: Promise<unknown>): Promise<AssistantFailure> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(AssistantFailure);
    return e as AssistantFailure;
  }
  throw new Error("did not throw");
}

const tick = () => new Promise((r) => setTimeout(r, 3));

describe("read_file", () => {
  it("numbers lines and honours from/to", async () => {
    await fs.addFile(p, "a.ts", "test", "one\ntwo\nthree\nfour");
    const all = (await tools.read_file({ path: "/p/a.ts" })).result;
    expect(all).toMatchObject({ totalLines: 4, from: 1, to: 4, truncated: false });
    expect(all.text.split("\n")[0]).toBe("    1| one");

    const part = (await tools.read_file({ path: "/p/a.ts", from: 2, to: 3 })).result;
    expect(part.text).toBe("    2| two\n    3| three");
    expect((await tools.read_file({ path: "/p/a.ts", to: 99 })).result.to).toBe(4);
  });

  it("returns empty text when from is past the end", async () => {
    await fs.addFile(p, "a.ts", "test", "one");
    const r = (await tools.read_file({ path: "/p/a.ts", from: 5 })).result;
    expect(r.text).toBe("");
    expect(r.truncated).toBe(false);
  });

  it("truncates past 2000 lines", async () => {
    const big = Array.from({ length: 2500 }, (_, i) => `l${i + 1}`).join("\n");
    await fs.addFile(p, "big.ts", "test", big);
    const r = (await tools.read_file({ path: "/p/big.ts" })).result;
    expect(r).toMatchObject({ totalLines: 2500, from: 1, to: 2000, truncated: true });
    expect(r.text.split("\n")).toHaveLength(2000);
    const rest = (await tools.read_file({ path: "/p/big.ts", from: 2001 })).result;
    expect(rest).toMatchObject({ to: 2500, truncated: false });
  });

  it("serialises non-string content as JSON", async () => {
    await fs.addFile(p, "o.scenario.json", "scenario", { a: 1 });
    const r = (await tools.read_file({ path: "/p/o.scenario.json" })).result;
    expect(r.text).toContain('"a": 1');
  });

  it("has no touched files and fails with file_not_found for unknown files", async () => {
    await fs.addFile(p, "a.ts", "test", "x");
    expect((await tools.read_file({ path: "/p/a.ts" })).touched).toBeUndefined();
    expect((await failure(tools.read_file({ path: "/p/zzz.ts" }))).code).toBe("file_not_found");
  });
});

describe("edit_file", () => {
  it("fails with edit_no_match", async () => {
    await fs.addFile(p, "a.ts", "test", "alpha");
    expect((await failure(tools.edit_file({ path: "/p/a.ts", old: "zzz", new: "y" }))).code).toBe("edit_no_match");
  });

  it("fails with edit_ambiguous and leaves the file alone", async () => {
    const id = await fs.addFile(p, "a.ts", "test", "ab ab");
    expect((await failure(tools.edit_file({ path: "/p/a.ts", old: "ab", new: "y" }))).code).toBe("edit_ambiguous");
    expect((await fs.loadFile<string>(id)).content).toBe("ab ab");
  });

  it("does not count overlapping matches twice", async () => {
    await fs.addFile(p, "a.ts", "test", "aaa");
    const r = await tools.edit_file({ path: "/p/a.ts", old: "aa", new: "b" });
    expect(r.result.line).toBe(1);
  });

  it("replaces exactly once, reports the line and keeps $ literal", async () => {
    const id = await fs.addFile(p, "a.ts", "test", "one\ntwo\nthree");
    const r = await tools.edit_file({ path: "/p/a.ts", old: "two", new: "$&2" });
    expect(r.result).toEqual({ path: "/p/a.ts", line: 2 });
    expect(r.touched).toEqual([{ fileId: id, projectId: p }]);
    expect((await fs.loadFile<string>(id)).content).toBe("one\n$&2\nthree");
  });

  it("refuses non-text content with edit_no_match and a write_file hint", async () => {
    const id = await fs.addFile(p, "a.scenario.json", "scenario", { a: 1 });
    const e = await failure(tools.edit_file({ path: "/p/a.scenario.json", old: "a", new: "b" }));
    expect(e.code).toBe("edit_no_match");
    expect(e.hint).toBe("This file is not plain text; read it and use write_file to replace it.");
    expect((await fs.loadFile<unknown>(id)).content).toEqual({ a: 1 });
  });

  it("fails with file_not_found for a missing file", async () => {
    expect((await failure(tools.edit_file({ path: "/p/no.ts", old: "a", new: "b" }))).code).toBe("file_not_found");
  });
});

describe("write_file", () => {
  it("creates files with the right types", async () => {
    const md = await tools.write_file({ path: "/p/notes.md", content: "# hi\n" });
    expect(md.result).toEqual({ path: "/p/notes.md", created: true, lines: 1 });
    expect(fs.getFileMetadata(md.touched![0]!.fileId)!.type).toBe("doc");

    const t = await tools.write_file({ path: "/p/a.test.ts", content: "x" });
    expect(fs.getFileMetadata(t.touched![0]!.fileId)!.type).toBe("test");
    expect(t.touched![0]!.projectId).toBe(p);

    const c = await tools.write_file({ path: "/p/a.smart.c", content: "x" });
    expect(fs.getFileMetadata(c.touched![0]!.fileId)!.type).toBe("smartc");
  });

  it("overwrites an existing file", async () => {
    const id = await fs.addFile(p, "a.ts", "test", "old");
    const r = await tools.write_file({ path: "/p/a.ts", content: "new\nlines" });
    expect(r.result).toEqual({ path: "/p/a.ts", created: false, lines: 2 });
    expect(r.touched![0]!.fileId).toBe(id);
    expect((await fs.loadFile<string>(id)).content).toBe("new\nlines");
  });

  it("refuses non-writable types", async () => {
    expect((await failure(tools.write_file({ path: "/p/a.asm", content: "x" }))).code).toBe("path_not_allowed");
  });
});

describe("delete_file", () => {
  it("deletes and reports the touched file", async () => {
    const id = await fs.addFile(p, "a.ts", "test", "x");
    const r = await tools.delete_file({ path: "/p/a.ts" });
    expect(r.result).toEqual({ path: "/p/a.ts", deleted: true });
    expect(r.touched).toEqual([{ fileId: id, projectId: p }]);
    expect(fs.getFileMetadata(id)).toBeNull();
  });

  it("refuses .asm and reports missing files", async () => {
    await fs.addFile(p, "a.asm", "asm", "x");
    expect((await failure(tools.delete_file({ path: "/p/a.asm" }))).code).toBe("path_not_allowed");
    expect((await failure(tools.delete_file({ path: "/p/gone.ts" }))).code).toBe("file_not_found");
  });
});

describe("create_project", () => {
  it("writes the starter and puts the contract first in touched", async () => {
    const r = await tools.create_project({ name: "My Counter" });
    expect(r.result).toEqual({ project: "My Counter", path: "/My Counter", files: ["/My Counter/my-counter.smart.c"] });
    const id = r.touched![0]!.fileId;
    expect(r.touched![0]!.projectId).toBe(fs.listFolderContents().folders.find((f) => f.metadata.name === "My Counter")!.id);
    expect((await fs.loadFile<string>(id)).content).toBe(smartcStarter("my-counter"));
    expect(fs.getFileMetadata(id)!.type).toBe("smartc");
  });

  it("uses uniqueName against existing projects", async () => {
    const r = await tools.create_project({ name: "p" });
    expect(r.result.project).toBe("p-2");
    expect(r.result.files).toEqual(["/p-2/p.smart.c"]);
  });

  it("rejects names that would break paths", async () => {
    expect((await failure(tools.create_project({ name: "a/b" }))).code).toBe("path_not_allowed");
  });
});

describe("list_files", () => {
  it("lists the tree with types", async () => {
    const src = await fs.createFolder(p, "src");
    await fs.addFile(p, "a.smart.c", "smartc", "x");
    await fs.addFile(src, "b.ts", "test", "y");
    const r = (await tools.list_files({ project: "p" })).result;
    expect(r.project).toBe("p");
    expect(r.files.map((f) => [f.path, f.type])).toEqual([
      ["/p/a.smart.c", "smartc"],
      ["/p/src/b.ts", "test"],
    ]);
  });

  it("rejects unknown projects", async () => {
    expect((await failure(tools.list_files({ project: "nope" }))).code).toBe("path_not_allowed");
  });
});

describe("list_projects", () => {
  it("is unknown without a contract or verdict", async () => {
    const r = (await tools.list_projects({})).result;
    expect(r.projects).toEqual([
      { name: "p", path: "/p", contract: null, testFiles: [], compile: "unknown", tests: null },
    ]);
    await fs.addFile(p, "a.smart.c", "smartc", "x");
    expect((await tools.list_projects({})).result.projects[0]!.compile).toBe("unknown");
  });

  it("reports ok, error and stale verdicts", async () => {
    const cid = await fs.addFile(p, "a.smart.c", "smartc", "x");
    fs.status.recordCompile(p, { sourceModified: fs.getFileMetadata(cid)!.lastModified, errorCount: 0 });
    let proj = (await tools.list_projects({})).result.projects[0]!;
    expect(proj.compile).toBe("ok");
    expect(proj.contract).toBe("/p/a.smart.c");

    fs.status.recordCompile(p, { sourceModified: fs.getFileMetadata(cid)!.lastModified, errorCount: 2 });
    expect((await tools.list_projects({})).result.projects[0]!.compile).toBe("error");

    await tick();
    await fs.saveFile(cid, "changed");
    proj = (await tools.list_projects({})).result.projects[0]!;
    expect(proj.compile).toBe("stale");
  });

  it("sums only fresh test verdicts and lists test entries", async () => {
    const cid = await fs.addFile(p, "a.smart.c", "smartc", "x");
    const t1 = await fs.addFile(p, "a.test.ts", "test", "t");
    const t2 = await fs.addFile(p, "b.test.ts", "test", "t");
    await fs.addFile(p, "helper.ts", "test", "h");
    const contractModified = fs.getFileMetadata(cid)!.lastModified;
    fs.status.recordTests(p, t1, { sourceModified: fs.getFileMetadata(t1)!.lastModified, contractModified, passed: 3, failed: 1 });
    fs.status.recordTests(p, t2, { sourceModified: fs.getFileMetadata(t2)!.lastModified - 1, contractModified, passed: 9, failed: 9 });

    const proj = (await tools.list_projects({})).result.projects[0]!;
    expect(proj.testFiles).toEqual(["/p/a.test.ts", "/p/b.test.ts"]);
    expect(proj.tests).toEqual({ passed: 3, failed: 1 });
  });

  it("makes test verdicts stale when the contract changed", async () => {
    const cid = await fs.addFile(p, "a.smart.c", "smartc", "x");
    const t1 = await fs.addFile(p, "a.test.ts", "test", "t");
    fs.status.recordTests(p, t1, {
      sourceModified: fs.getFileMetadata(t1)!.lastModified,
      contractModified: fs.getFileMetadata(cid)!.lastModified,
      passed: 1,
      failed: 0,
    });
    await tick();
    await fs.saveFile(cid, "y");
    expect((await tools.list_projects({})).result.projects[0]!.tests).toBeNull();
  });

  it("lists only top-level folders", async () => {
    await fs.createFolder(p, "src");
    expect((await tools.list_projects({})).result.projects.map((x) => x.name)).toEqual(["p"]);
  });
});
