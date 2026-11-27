import { describe, expect, it } from "bun:test";
import { captureProject, MemoryCheckpointStore } from "@/features/assistant/rounds/checkpoints";
import { createTestFs } from "@/features/assistant/tools/test-fs";
import type { FileSystem } from "@/lib/file-system/file-system";
import { gitBlobSha } from "@/lib/git-sync/blob-sha";
import { GitSyncError } from "@/lib/git-sync/errors";
import { serializeMarker } from "@/lib/git-sync/marker";
import type { RepoRef } from "@/lib/git-sync/provider";
import { RepoLinks } from "@/lib/git-sync/repo-links";
import { FakeGitHub } from "./fake-provider";
import { GitSync } from "./sync-service";
import { trackedType } from "./tracked-type";

const ref: RepoRef = { owner: "o", repo: "repo" };
const marker = serializeMarker({ format: 1 });

const seedFiles = {
  "c/.smartc-studio": marker,
  "c/a.smart.c": "int a;",
  "c/b.ts": "b",
  "c/README.md": "# r",
  "c/package.json": "{}",
  "c/x.ts": new Uint8Array([1, 0, 2]),
  ".github/ci.yml": "on: push",
};

function base() {
  const gh = new FakeGitHub();
  const { fs, storage } = createTestFs();
  const links = new RepoLinks(storage);
  const state = { locked: false, order: [] as string[], pending: null as null | (() => Promise<void>) };
  const sync = new GitSync({
    fs,
    links,
    provider: () => gh,
    checkpoints: new MemoryCheckpointStore(),
    clock: { now: () => 0 },
    flush: async () => {
      state.order.push("flush");
      const pending = state.pending;
      state.pending = null;
      await pending?.();
    },
    isLocked: () => state.locked,
    markTookOver: () => {},
  });
  return { gh, fs, links, sync, state };
}

function helpers(fs: FileSystem, projectId: string) {
  const fileId = (relPath: string) => {
    const path = `${fs.getFolder(projectId).path}/${relPath}`;
    return fs.listFilesRecursive(projectId).find((m) => m.path === path)!.id;
  };
  return {
    local: async () =>
      Object.fromEntries((await captureProject(fs, projectId)).map((f) => [f.relPath, f.content])),
    edit: async (relPath: string, text: string) => {
      await fs.saveFile(fileId(relPath), text);
    },
    add: async (relPath: string, text: string) => {
      const parts = relPath.split("/");
      const name = parts.pop()!;
      let folderId = projectId;
      for (const part of parts) {
        const existing = fs.listFolderContents(folderId).folders.find((f) => f.metadata.name === part);
        folderId = existing ? existing.id : await fs.createFolder(folderId, part);
      }
      await fs.addFile(folderId, name, trackedType(name)!, text);
    },
    remove: async (relPath: string) => {
      await fs.deleteFile(fileId(relPath));
    },
  };
}

async function setup(files: Record<string, string | Uint8Array> = seedFiles) {
  const b = base();
  await b.gh.seed(ref, "main", files);
  const { projectId } = await b.sync.importProject(ref, "main", "c");
  return { ...b, projectId, ...helpers(b.fs, projectId) };
}

/** A local project that is not linked yet. */
async function localProject(files: Record<string, string>) {
  const b = base();
  const projectId = await b.fs.createFolder(b.fs.rootFolderId, "p");
  const h = helpers(b.fs, projectId);
  for (const [relPath, text] of Object.entries(files)) await h.add(relPath, text);
  return { ...b, projectId, ...h };
}

async function remoteShas(gh: FakeGitHub) {
  const head = (await gh.getHead(ref, "main"))!;
  return Object.fromEntries((await gh.getTree(ref, head.tree)).map((e) => [e.path, e.sha]));
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as GitSyncError;
  }
  throw new Error("expected rejection");
};

describe("GitSync push", () => {
  it("pushes local edits, additions and deletions in one commit on top of the base", async () => {
    const { gh, sync, links, projectId, edit, add, remove } = await setup();
    const before = links.get(projectId)!.baseCommit;
    await edit("a.smart.c", "int a2;");
    await add("sub/n.ts", "n");
    await remove("README.md");
    expect(await sync.pendingChanges(projectId)).toEqual({
      upserts: ["a.smart.c", "sub/n.ts"],
      deletes: ["README.md"],
    });

    const { commit } = await sync.push(projectId, "msg");

    const remote = gh.files(ref, "main");
    expect(remote["c/a.smart.c"]).toBe("int a2;");
    expect(remote["c/sub/n.ts"]).toBe("n");
    expect(remote["c/b.ts"]).toBe("b");
    expect(Object.hasOwn(remote, "c/README.md")).toBe(false);
    expect(gh.commitsOn(ref, "main").slice(0, 2)).toEqual([commit, before]);
    expect(gh.commitMessage(commit)).toBe("msg");
    const link = links.get(projectId)!;
    expect(link.baseCommit).toBe(commit);
    expect(link.baseFiles).toEqual({
      "a.smart.c": await gitBlobSha("int a2;"),
      "b.ts": await gitBlobSha("b"),
      "sub/n.ts": await gitBlobSha("n"),
    });
    expect(await sync.status(projectId, { remote: true })).toEqual({
      state: "in_sync",
      localChanges: 0,
      remoteAhead: false,
    });
  });

  it("push never touches untracked or skipped remote files", async () => {
    const { gh, sync, projectId, edit } = await setup();
    const before = await remoteShas(gh);
    await edit("a.smart.c", "int a2;");
    await sync.push(projectId, "msg");
    const after = await remoteShas(gh);
    for (const path of ["c/package.json", ".github/ci.yml", "c/x.ts", "c/.smartc-studio"]) {
      expect(after[path]).toBe(before[path]);
    }
    expect(await gh.getBlob(ref, after["c/x.ts"])).toEqual(new Uint8Array([1, 0, 2]));
  });

  it("push never deletes skipped remote files", async () => {
    const { gh, sync, projectId, remove } = await setup();
    const before = await remoteShas(gh);
    await remove("b.ts");
    await sync.push(projectId, "msg");
    const after = await remoteShas(gh);
    expect(Object.hasOwn(after, "c/b.ts")).toBe(false);
    expect(after["c/x.ts"]).toBe(before["c/x.ts"]);
  });

  it("push never overwrites a skipped remote file with a local file of the same path", async () => {
    const { gh, sync, links, projectId, add, edit } = await setup();
    const before = await remoteShas(gh);
    await add("x.ts", "text");
    expect((await codeOf(sync.push(projectId, "msg"))).code).toBe("nothing_to_push");
    await edit("a.smart.c", "int a2;");
    await sync.push(projectId, "msg");
    const after = await remoteShas(gh);
    expect(after["c/x.ts"]).toBe(before["c/x.ts"]);
    expect(after["c/a.smart.c"]).toBe(await gitBlobSha("int a2;"));
    expect(Object.hasOwn(links.get(projectId)!.baseFiles, "x.ts")).toBe(false);
  });

  it("refuses when the branch moved and says pull first", async () => {
    const { gh, sync, links, projectId, edit } = await setup();
    await gh.seed(ref, "main", { "c/b.ts": "theirs" });
    await edit("a.smart.c", "int a2;");
    const before = links.get(projectId);
    const err = await codeOf(sync.push(projectId, "msg"));
    expect(err.code).toBe("not_fast_forward");
    expect(err.message).toBe("The branch moved on GitHub — pull first.");
    expect(links.get(projectId)).toEqual(before);
  });

  it("rejected ref update leaves the link unchanged", async () => {
    const { gh, sync, links, projectId, edit } = await setup();
    await edit("a.smart.c", "int a2;");
    const before = links.get(projectId);
    gh.beforeUpdateRef = () => gh.seed(ref, "main", { "c/b.ts": "someone else" });
    expect((await codeOf(sync.push(projectId, "msg"))).code).toBe("not_fast_forward");
    expect(links.get(projectId)).toEqual(before);
    expect(gh.files(ref, "main")["c/a.smart.c"]).toBe("int a;");
  });

  it("push flushes pending saves before reading", async () => {
    const { gh, fs, sync, state, projectId, edit } = await setup();
    const load = fs.loadFile.bind(fs);
    fs.loadFile = (async (id: string) => {
      state.order.push("load");
      return load(id);
    }) as typeof fs.loadFile;
    state.order = [];
    state.pending = () => edit("a.smart.c", "typed just now");
    await sync.push(projectId, "msg");
    expect(state.order[0]).toBe("flush");
    expect(state.order).toContain("load");
    expect(gh.files(ref, "main")["c/a.smart.c"]).toBe("typed just now");
  });

  it("refuses with nothing to push and while locked", async () => {
    const { sync, state, projectId, edit } = await setup();
    expect((await codeOf(sync.push(projectId, "msg"))).code).toBe("nothing_to_push");
    await edit("a.smart.c", "int a2;");
    state.locked = true;
    expect((await codeOf(sync.push(projectId, "msg"))).code).toBe("locked");
  });

  it("links a project to an empty repo: marker commit first, then a push uploads all files", async () => {
    const { gh, sync, links, projectId } = await localProject({ "a.smart.c": "int a;", "lib/b.ts": "b" });
    gh.createEmptyRepo(ref);
    expect(await sync.linkProject(projectId, ref, null, "")).toBeNull();
    const [markerCommit] = gh.commitsOn(ref, "main");
    expect(links.get(projectId)).toMatchObject({ branch: "main", path: "", baseCommit: markerCommit, baseFiles: {} });

    const { commit } = await sync.push(projectId, "first push");
    expect(gh.files(ref, "main")).toEqual({ ".smartc-studio": marker, "a.smart.c": "int a;", "lib/b.ts": "b" });
    expect(gh.commitsOn(ref, "main").map((c) => gh.commitMessage(c))).toEqual([
      "first push",
      "Initialize SmartC Studio project",
    ]);
    expect(links.get(projectId)!.baseCommit).toBe(commit);
  });

  it("links to a folder with existing files via conflicts", async () => {
    const { gh, sync, links, projectId, local } = await localProject({ "a.smart.c": "local", "b.ts": "b" });
    await gh.seed(ref, "main", { "c/.smartc-studio": marker, "c/a.smart.c": "remote", "c/b.ts": "b" });
    const prepared = (await sync.linkProject(projectId, ref, "main", "c"))!;
    expect(prepared.conflicts).toEqual([
      { relPath: "a.smart.c", local: await gitBlobSha("local"), remote: await gitBlobSha("remote") },
    ]);
    expect(links.get(projectId)).toMatchObject({ baseCommit: "", baseFiles: {} });
    const err = await codeOf(sync.push(projectId, "msg"));
    expect(err.code).toBe("not_fast_forward");
    expect(err.message).toBe("The branch moved on GitHub — pull first.");

    await sync.applyPull(prepared, { "a.smart.c": "mine" });
    expect((await local())["a.smart.c"]).toBe("local");
    await sync.push(projectId, "mine wins");
    expect(gh.files(ref, "main")["c/a.smart.c"]).toBe("local");
  });

  it("linking pulls remote-only files and does not re-initialize a valid marker", async () => {
    const { gh, sync, links, projectId, local } = await localProject({ "a.smart.c": "int a;" });
    const head = await gh.seed(ref, "main", {
      "c/.smartc-studio": marker,
      "c/n.ts": "n",
      "c/x.ts": new Uint8Array([0]),
    });
    expect(await sync.linkProject(projectId, ref, "main", "c")).toBeNull();
    expect(gh.commitsOn(ref, "main")).toEqual([head]);
    expect(await local()).toEqual({ "a.smart.c": "int a;", "n.ts": "n" });
    expect(links.get(projectId)).toMatchObject({ baseCommit: head, baseFiles: { "n.ts": await gitBlobSha("n") } });
    expect(await sync.pendingChanges(projectId)).toEqual({ upserts: ["a.smart.c"], deletes: [] });
  });

  it("linking overwrites an invalid marker", async () => {
    const { gh, sync, links, projectId } = await localProject({ "a.smart.c": "int a;" });
    await gh.seed(ref, "main", { "c/.smartc-studio": "not json" });
    expect(await sync.linkProject(projectId, ref, "main", "c")).toBeNull();
    expect(gh.files(ref, "main")["c/.smartc-studio"]).toBe(marker);
    expect(links.get(projectId)!.baseCommit).toBe(gh.commitsOn(ref, "main")[0]);
  });

  it("refuses to link a folder that would nest markers", async () => {
    const { gh, sync, links, projectId } = await localProject({ "a.smart.c": "int a;" });
    const head = await gh.seed(ref, "main", { ".smartc-studio": marker, "other/.smartc-studio": marker });
    expect((await codeOf(sync.linkProject(projectId, ref, "main", "c"))).code).toBe("nested_markers");
    expect((await codeOf(sync.linkProject(projectId, ref, "main", ""))).code).toBe("nested_markers");
    expect(gh.commitsOn(ref, "main")).toEqual([head]);
    expect(links.get(projectId)).toBeNull();
  });

  it("refuses to link while locked", async () => {
    const { gh, sync, state, links, projectId } = await localProject({ "a.smart.c": "int a;" });
    gh.createEmptyRepo(ref);
    state.locked = true;
    expect((await codeOf(sync.linkProject(projectId, ref, null, ""))).code).toBe("locked");
    expect(gh.commitsOn(ref, "main")).toEqual([]);
    expect(links.get(projectId)).toBeNull();
  });

  it("a failed link leaves no link behind", async () => {
    const { gh, sync, links, projectId } = await localProject({ "a.smart.c": "int a;" });
    await gh.seed(ref, "main", { "c/.smartc-studio": serializeMarker({ format: 2 }) });
    expect((await codeOf(sync.linkProject(projectId, ref, "main", "c"))).code).toBe("format_unsupported");
    expect(links.get(projectId)).toBeNull();
  });

  it("unlink removes the link and the pending undo", async () => {
    const { gh, sync, links, projectId } = await setup();
    await gh.seed(ref, "main", { "c/b.ts": "theirs" });
    const { undoToken } = await sync.applyPull((await sync.preparePull(projectId))!, {});
    sync.unlink(projectId);
    expect(links.get(projectId)).toBeNull();
    expect((await codeOf(sync.push(projectId, "msg"))).code).toBe("not_found");
    await expect(sync.undoPull(undoToken)).rejects.toThrow("Unknown undo token.");
    expect(links.get(projectId)).toBeNull();
  });
});
