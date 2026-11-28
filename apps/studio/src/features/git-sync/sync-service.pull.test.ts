import { describe, expect, it } from "bun:test";
import { captureProject, MemoryCheckpointStore } from "@/features/assistant/rounds/checkpoints";
import { createTestFs } from "@/features/assistant/tools/test-fs";
import { FileTypes } from "@/features/project/filetype-icons";
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
};

async function setup(files: Record<string, string> = seedFiles) {
  const gh = new FakeGitHub();
  const { fs, storage } = createTestFs();
  const links = new RepoLinks(storage);
  const state = { locked: false, tookOver: [] as string[] };
  const sync = new GitSync({
    fs,
    links,
    provider: () => gh,
    checkpoints: new MemoryCheckpointStore(),
    clock: { now: () => 0 },
    flush: async () => {},
    isLocked: () => state.locked,
    markTookOver: (id) => state.tookOver.push(id),
  });
  await gh.seed(ref, "main", files);
  const { projectId } = await sync.importProject(ref, "main", "c");
  const local = async () =>
    Object.fromEntries((await captureProject(fs, projectId)).map((f) => [f.relPath, f.content]));
  const edit = async (relPath: string, text: string) => {
    const path = `${fs.getFolder(projectId).path}/${relPath}`;
    const meta = fs.listFilesRecursive(projectId).find((m) => m.path === path)!;
    await fs.saveFile(meta.id, text);
  };
  const add = (name: string, text: string) => fs.addFile(projectId, name, trackedType(name)!, text);
  const remove = async (relPath: string) => {
    const path = `${fs.getFolder(projectId).path}/${relPath}`;
    await fs.deleteFile(fs.listFilesRecursive(projectId).find((m) => m.path === path)!.id);
  };
  return { gh, fs, links, sync, state, projectId, local, edit, add, remove };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as GitSyncError;
  }
  throw new Error("expected rejection");
};

describe("GitSync pull", () => {
  it("is up to date when the head did not move", async () => {
    const { sync, projectId } = await setup();
    expect(await sync.preparePull(projectId)).toBeNull();
  });

  it("applies remote-only changes silently and moves the base", async () => {
    const { gh, sync, links, projectId, local } = await setup();
    const head = await gh.seed(ref, "main", { "c/a.smart.c": "int a2;", "c/n.ts": "n", "c/README.md": null });
    const p = (await sync.preparePull(projectId))!;
    expect(p.conflicts).toEqual([]);
    expect(p.actions).toEqual([
      { kind: "delete", relPath: "README.md" },
      { kind: "write", relPath: "a.smart.c" },
      { kind: "write", relPath: "n.ts" },
    ]);
    const res = await sync.applyPull(p, {});
    expect(res.written).toEqual(["a.smart.c", "n.ts"]);
    expect(res.deleted).toEqual(["README.md"]);
    expect(await local()).toEqual({ "a.smart.c": "int a2;", "b.ts": "b", "n.ts": "n" });
    const link = links.get(projectId)!;
    expect(link.baseCommit).toBe(head);
    expect(link.baseFiles).toEqual({
      "a.smart.c": await gitBlobSha("int a2;"),
      "b.ts": await gitBlobSha("b"),
      "n.ts": await gitBlobSha("n"),
    });
    expect(await sync.status(projectId, { remote: true })).toEqual({
      state: "in_sync",
      localChanges: 0,
      remoteAhead: false,
    });
  });

  it("keeps local-only changes", async () => {
    const { gh, sync, projectId, local, edit } = await setup();
    await edit("b.ts", "mine");
    await gh.seed(ref, "main", { "c/a.smart.c": "int a2;" });
    const p = (await sync.preparePull(projectId))!;
    await sync.applyPull(p, {});
    expect(await local()).toMatchObject({ "a.smart.c": "int a2;", "b.ts": "mine" });
    expect((await sync.status(projectId)).localChanges).toBe(1);
  });

  it("requires a choice per conflict and honours mine/theirs", async () => {
    const theirs = await setup();
    await theirs.edit("a.smart.c", "local");
    await theirs.gh.seed(ref, "main", { "c/a.smart.c": "remote" });
    const p = (await theirs.sync.preparePull(theirs.projectId))!;
    expect(p.conflicts).toEqual([
      { relPath: "a.smart.c", local: await gitBlobSha("local"), remote: await gitBlobSha("remote") },
    ]);
    expect(p.remoteText["a.smart.c"]).toBe("remote");
    await expect(theirs.sync.applyPull(p, {})).rejects.toThrow();
    expect((await theirs.local())["a.smart.c"]).toBe("local");
    await theirs.sync.applyPull(p, { "a.smart.c": "theirs" });
    expect((await theirs.local())["a.smart.c"]).toBe("remote");

    const mine = await setup();
    await mine.edit("a.smart.c", "local");
    await mine.gh.seed(ref, "main", { "c/a.smart.c": "remote" });
    const q = (await mine.sync.preparePull(mine.projectId))!;
    const res = await mine.sync.applyPull(q, { "a.smart.c": "mine" });
    expect(res.written).toEqual([]);
    expect((await mine.local())["a.smart.c"]).toBe("local");
    expect((await mine.sync.status(mine.projectId)).localChanges).toBe(1);
  });

  it("refuses while the project is locked", async () => {
    const { gh, sync, state, projectId } = await setup();
    await gh.seed(ref, "main", { "c/a.smart.c": "int a2;" });
    const p = (await sync.preparePull(projectId))!;
    state.locked = true;
    expect((await codeOf(sync.preparePull(projectId))).code).toBe("locked");
    expect((await codeOf(sync.applyPull(p, {}))).code).toBe("locked");
  });

  it("refuses a stale prepared pull", async () => {
    const { gh, sync, links, projectId, local, edit } = await setup();
    const before = links.get(projectId);
    await gh.seed(ref, "main", { "c/a.smart.c": "int a2;" });
    const p = (await sync.preparePull(projectId))!;
    await edit("b.ts", "changed meanwhile");
    expect((await codeOf(sync.applyPull(p, {}))).code).toBe("stale");
    expect(await local()).toEqual({ "a.smart.c": "int a;", "b.ts": "changed meanwhile", "README.md": "# r" });
    expect(links.get(projectId)).toEqual(before);
  });

  it("stops when the marker was removed remotely", async () => {
    const { gh, sync, projectId, local } = await setup();
    await gh.seed(ref, "main", { "c/.smartc-studio": null, "c/a.smart.c": "int a2;" });
    expect((await codeOf(sync.preparePull(projectId))).code).toBe("no_marker");
    expect(await local()).toEqual({ "a.smart.c": "int a;", "b.ts": "b", "README.md": "# r" });
  });

  it("stops on an invalid or newer marker", async () => {
    const bad = await setup();
    await bad.gh.seed(ref, "main", { "c/.smartc-studio": "nope" });
    expect((await codeOf(bad.sync.preparePull(bad.projectId))).code).toBe("invalid_marker");
    const newer = await setup();
    await newer.gh.seed(ref, "main", { "c/.smartc-studio": serializeMarker({ format: 2 }) });
    expect((await codeOf(newer.sync.preparePull(newer.projectId))).code).toBe("format_unsupported");
  });

  it("undo restores the previous files and the previous link", async () => {
    const { gh, sync, links, projectId, local } = await setup();
    const l0 = links.get(projectId);
    const files0 = await local();
    await gh.seed(ref, "main", {
      "c/.smartc-studio": serializeMarker({ format: 1, extra: true }),
      "c/a.smart.c": "int a2;",
      "c/README.md": null,
    });
    const { undoToken } = await sync.applyPull((await sync.preparePull(projectId))!, {});
    expect(links.get(projectId)!.marker).toEqual({ format: 1, extra: true });
    await sync.undoPull(undoToken);
    expect(await local()).toEqual(files0);
    expect(links.get(projectId)).toEqual(l0);
    expect((await sync.status(projectId, { remote: true })).state).toBe("remote");
  });

  it("marks the assistant as taken over after pull and undo", async () => {
    const { gh, sync, state, projectId } = await setup();
    await gh.seed(ref, "main", { "c/a.smart.c": "int a2;" });
    const { undoToken } = await sync.applyPull((await sync.preparePull(projectId))!, {});
    await sync.undoPull(undoToken);
    expect(state.tookOver).toEqual([projectId, projectId]);
  });

  it("status counts local changes and sees the remote ahead", async () => {
    const { gh, sync, projectId, edit } = await setup();
    await edit("a.smart.c", "x");
    await edit("b.ts", "y");
    await gh.seed(ref, "main", { "c/n.ts": "n" });
    expect(await sync.status(projectId, { remote: true })).toEqual({
      state: "diverged",
      localChanges: 2,
      remoteAhead: true,
    });
    expect(await sync.status(projectId)).toEqual({ state: "local", localChanges: 2, remoteAhead: null });
  });

  it("localShas covers tracked files keyed by project-relative path", async () => {
    const { sync, projectId } = await setup();
    expect(await sync.localShas(projectId)).toEqual({
      "a.smart.c": await gitBlobSha("int a;"),
      "b.ts": await gitBlobSha("b"),
      "README.md": await gitBlobSha("# r"),
    });
  });

  it("keeps one contract: a second remote contract is never pulled", async () => {
    const { gh, sync, links, projectId, local } = await setup({
      "c/.smartc-studio": marker,
      "c/a.smart.c": "a",
      "c/lib/b.smart.c": "b",
    });
    expect(await sync.preparePull(projectId)).toBeNull();
    await gh.seed(ref, "main", { "c/lib/b.smart.c": "b2" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.actions).toEqual([]);
    expect(p.skipped).toEqual(["lib/b.smart.c"]);
    expect(Object.keys(p.remote)).toEqual(["a.smart.c"]);
    await sync.applyPull(p, {});
    expect(await local()).toEqual({ "a.smart.c": "a" });
    expect(Object.keys(links.get(projectId)!.baseFiles)).toEqual(["a.smart.c"]);
  });

  it("keeps the base contract even when another one sorts first", async () => {
    const { gh, sync, projectId, local } = await setup({ "c/.smartc-studio": marker, "c/m.smart.c": "m" });
    await gh.seed(ref, "main", { "c/a.smart.c": "a", "c/m.smart.c": "m2" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.skipped).toEqual(["a.smart.c"]);
    await sync.applyPull(p, {});
    expect(await local()).toEqual({ "m.smart.c": "m2" });
  });

  it("leaves remote binary files with a tracked extension out of the pull", async () => {
    const { gh, sync, projectId, local } = await setup();
    await gh.seed(ref, "main", { "c/x.ts": new Uint8Array([1, 0, 2]) });
    const p = (await sync.preparePull(projectId))!;
    expect(p.skipped).toContain("x.ts");
    expect(p.remote["x.ts"]).toBeUndefined();
    await sync.applyPull(p, {});
    expect(Object.keys(await local()).sort()).toEqual(["README.md", "a.smart.c", "b.ts"]);
  });

  it("writes a remote rename whose content is already known", async () => {
    const { gh, sync, links, projectId, local } = await setup();
    await gh.seed(ref, "main", { "c/README.md": null, "c/docs.md": "# r" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.remoteText).toEqual({ "docs.md": "# r" });
    await sync.applyPull(p, {});
    expect(await local()).toEqual({ "a.smart.c": "int a;", "b.ts": "b", "docs.md": "# r" });
    expect(Object.keys(links.get(projectId)!.baseFiles).sort()).toEqual(["a.smart.c", "b.ts", "docs.md"]);
    expect((await sync.status(projectId)).localChanges).toBe(0);
  });

  it("writes a remote copy of a local-only text", async () => {
    const { gh, sync, projectId, local, edit } = await setup();
    await edit("b.ts", "mine");
    await gh.seed(ref, "main", { "c/n.ts": "mine" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.remoteText).toEqual({ "n.ts": "mine" });
    await sync.applyPull(p, {});
    expect(await local()).toMatchObject({ "b.ts": "mine", "n.ts": "mine" });
  });

  it("refuses to apply a write without remote text", async () => {
    const { gh, sync, projectId, local } = await setup();
    await gh.seed(ref, "main", { "c/n.ts": "n" });
    const p = (await sync.preparePull(projectId))!;
    await expect(sync.applyPull({ ...p, remoteText: {} }, {})).rejects.toThrow(/n\.ts/);
    expect(Object.keys(await local())).not.toContain("n.ts");
  });

  it("never pulls a second contract next to a local-only one", async () => {
    const { gh, sync, projectId, local, add } = await setup({ "c/.smartc-studio": marker, "c/b.ts": "b" });
    await add("x.smart.c", "x");
    await gh.seed(ref, "main", { "c/y.smart.c": "y" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.skipped).toEqual(["y.smart.c"]);
    expect(p.remote["y.smart.c"]).toBeUndefined();
    await sync.applyPull(p, {});
    expect(await local()).toEqual({ "b.ts": "b", "x.smart.c": "x" });
  });

  it("prefers the local contract when the remote has it too", async () => {
    const { gh, sync, projectId, add } = await setup({ "c/.smartc-studio": marker, "c/b.ts": "b" });
    await add("x.smart.c", "x");
    await gh.seed(ref, "main", { "c/a.smart.c": "a", "c/x.smart.c": "x" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.skipped).toEqual(["a.smart.c"]);
    expect(Object.keys(p.remote).sort()).toEqual(["b.ts", "x.smart.c"]);
  });

  it("follows a remote rename of an unchanged base contract", async () => {
    const { gh, sync, links, projectId, local } = await setup();
    await gh.seed(ref, "main", { "c/a.smart.c": null, "c/z.smart.c": "int z;" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.skipped).toEqual([]);
    expect(p.actions).toEqual([
      { kind: "delete", relPath: "a.smart.c" },
      { kind: "write", relPath: "z.smart.c" },
    ]);
    await sync.applyPull(p, {});
    expect(await local()).toEqual({ "z.smart.c": "int z;", "b.ts": "b", "README.md": "# r" });
    expect(links.get(projectId)!.baseFiles["z.smart.c"]).toBe(await gitBlobSha("int z;"));
    expect(links.get(projectId)!.baseFiles["a.smart.c"]).toBeUndefined();
  });

  it("keeps a locally edited contract when the remote renamed it", async () => {
    const { gh, sync, projectId, local, edit } = await setup();
    await edit("a.smart.c", "edited");
    await gh.seed(ref, "main", { "c/a.smart.c": null, "c/z.smart.c": "int z;" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.skipped).toEqual(["z.smart.c"]);
    expect(p.actions).toEqual([]);
    expect(p.conflicts).toEqual([{ relPath: "a.smart.c", local: await gitBlobSha("edited"), remote: null }]);
    await expect(sync.applyPull(p, {})).rejects.toThrow();
    await sync.applyPull(p, { "a.smart.c": "mine" });
    expect(await local()).toEqual({ "a.smart.c": "edited", "b.ts": "b", "README.md": "# r" });
  });

  it("refuses a resolution that leaves two contracts", async () => {
    const { gh, sync, links, projectId, local, add, remove } = await setup();
    const before = links.get(projectId);
    await remove("a.smart.c");
    await add("x.smart.c", "int a;");
    await gh.seed(ref, "main", { "c/a.smart.c": "int a2;" });
    const p = (await sync.preparePull(projectId))!;
    expect(p.conflicts.map((c) => c.relPath)).toEqual(["a.smart.c"]);
    expect((await codeOf(sync.applyPull(p, { "a.smart.c": "theirs" }))).code).toBe("multiple_contracts");
    expect(Object.keys(await local()).sort()).toEqual(["README.md", "b.ts", "x.smart.c"]);
    expect(links.get(projectId)).toEqual(before);
  });

  it("refuses an undo that would overwrite edits made after the pull", async () => {
    const { gh, sync, links, projectId, local, edit } = await setup();
    await gh.seed(ref, "main", { "c/a.smart.c": "int a2;" });
    const { undoToken } = await sync.applyPull((await sync.preparePull(projectId))!, {});
    const after = links.get(projectId);
    await edit("b.ts", "later");
    expect((await codeOf(sync.undoPull(undoToken))).code).toBe("stale");
    expect(await local()).toMatchObject({ "a.smart.c": "int a2;", "b.ts": "later" });
    expect(links.get(projectId)).toEqual(after);
  });

  it("refuses an undo that would overwrite edits to files sync does not track", async () => {
    const { gh, fs, sync, links, projectId, local } = await setup();
    await gh.seed(ref, "main", { "c/a.smart.c": "int a2;" });
    const { undoToken } = await sync.applyPull((await sync.preparePull(projectId))!, {});
    const after = links.get(projectId);
    await fs.addFile(projectId, "notes.txt", FileTypes.Doc, "written after the pull");
    expect((await codeOf(sync.undoPull(undoToken))).code).toBe("stale");
    expect(await local()).toMatchObject({ "a.smart.c": "int a2;", "notes.txt": "written after the pull" });
    expect(links.get(projectId)).toEqual(after);
  });

  it("stops when a nested marker appeared below the project folder", async () => {
    const { gh, sync, projectId, local } = await setup();
    await gh.seed(ref, "main", { "c/sub/.smartc-studio": marker, "c/a.smart.c": "int a2;" });
    expect((await codeOf(sync.preparePull(projectId))).code).toBe("nested_markers");
    expect((await local())["a.smart.c"]).toBe("int a;");
  });
});
