import { describe, expect, it } from "bun:test";
import { MemoryCheckpointStore } from "@/features/assistant/rounds/checkpoints";
import { createTestFs } from "@/features/assistant/tools/test-fs";
import { uniqueName } from "@/features/project/file-naming";
import { gitBlobSha } from "@/lib/git-sync/blob-sha";
import { GitSyncError } from "@/lib/git-sync/errors";
import { parseMarker, serializeMarker } from "@/lib/git-sync/marker";
import type { GitProvider, RepoRef } from "@/lib/git-sync/provider";
import { RepoLinks } from "@/lib/git-sync/repo-links";
import { FakeGitHub } from "./fake-provider";
import { GitSync } from "./sync-service";

const ref: RepoRef = { owner: "o", repo: "repo" };
const marker = serializeMarker({ format: 1 });

function setup(provider?: () => GitProvider) {
  const gh = new FakeGitHub();
  const { fs, storage } = createTestFs();
  const links = new RepoLinks(storage);
  const sync = new GitSync({
    fs,
    links,
    provider: provider ?? (() => gh),
    checkpoints: new MemoryCheckpointStore(),
    clock: { now: () => 0 },
    flush: async () => {},
    isLocked: () => false,
    markTookOver: () => {},
  });
  return { gh, fs, links, sync };
}

const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as GitSyncError;
  }
  throw new Error("expected rejection");
};

describe("GitSync import", () => {
  it("imports tracked files under the marker folder and links the project", async () => {
    const { gh, fs, links, sync } = setup();
    const head = await gh.seed(ref, "main", {
      "contracts/.smartc-studio": marker,
      "contracts/a.smart.c": "int a;",
      "contracts/t/a.test.ts": "test",
      "contracts/README.md": "# hi",
      "contracts/package.json": "{}",
      "root.smart.c": "int r;",
    });
    const res = await sync.importProject(ref, "main", "contracts");
    expect(res.skipped).toEqual(["package.json"]);
    expect(res.imported).toBe(3);
    const root = fs.listFolderContents(fs.rootFolderId).folders.find((f) => f.id === res.projectId)!;
    expect(root.metadata.name).toBe("contracts");
    const paths = fs.listFilesRecursive(res.projectId).map((f) => f.name).sort();
    expect(paths).toEqual(["README.md", "a.smart.c", "a.test.ts"]);
    const link = links.get(res.projectId)!;
    expect(link).toMatchObject({ path: "contracts", branch: "main", baseCommit: head, owner: "o", repo: "repo" });
    expect(link.baseFiles).toEqual({
      "README.md": await gitBlobSha("# hi"),
      "a.smart.c": await gitBlobSha("int a;"),
      "t/a.test.ts": await gitBlobSha("test"),
    });
  });

  it("reports binary files with a tracked extension as skipped and leaves them out of baseFiles", async () => {
    const { gh, links, sync } = setup();
    await gh.seed(ref, "main", {
      "c/.smartc-studio": marker,
      "c/x.ts": new Uint8Array([1, 0, 2]),
      "c/y.ts": "ok",
    });
    const res = await sync.importProject(ref, "main", "c");
    expect(res.skipped).toEqual(["x.ts"]);
    expect(res.imported).toBe(1);
    expect(Object.keys(links.get(res.projectId)!.baseFiles)).toEqual(["y.ts"]);
  });

  it("keeps one contract per project and reports the others as skipped", async () => {
    const { gh, links, sync } = setup();
    await gh.seed(ref, "main", {
      "c/.smartc-studio": marker,
      "c/a.smart.c": "a",
      "c/lib/b.smart.c": "b",
    });
    const res = await sync.importProject(ref, "main", "c");
    expect(res.imported).toBe(1);
    expect(res.skipped).toEqual(["lib/b.smart.c"]);
    expect(Object.keys(links.get(res.projectId)!.baseFiles)).toEqual(["a.smart.c"]);
  });

  it("refuses no marker, nested markers, invalid markers and newer formats", async () => {
    const { gh, sync } = setup();
    await gh.seed(ref, "main", {
      "plain/a.smart.c": "x",
      ".smartc-studio": marker,
      "inner/.smartc-studio": marker,
      "bad/.smartc-studio": "nope",
      "new/.smartc-studio": serializeMarker({ format: 2 }),
    });
    expect((await codeOf(sync.importProject(ref, "main", "plain"))).code).toBe("no_marker");
    expect((await codeOf(sync.importProject(ref, "main", "inner"))).code).toBe("nested_markers");
    expect((await codeOf(sync.importProject(ref, "main", ""))).code).toBe("nested_markers");
    expect((await codeOf(sync.importProject(ref, "main", "bad"))).code).toBe("nested_markers");

    const other = setup();
    await other.gh.seed(ref, "main", {
      "bad/.smartc-studio": "nope",
      "new/.smartc-studio": serializeMarker({ format: 2 }),
    });
    expect((await codeOf(other.sync.importProject(ref, "main", "bad"))).code).toBe("invalid_marker");
    const newer = await codeOf(other.sync.importProject(ref, "main", "new"));
    expect(newer.code).toBe("format_unsupported");
    expect(newer.message).toBe("This repo needs a newer Studio.");
  });

  it("names the project after the repo for a root marker and makes the name unique", async () => {
    const { gh, fs, sync } = setup();
    await fs.createFolder(fs.rootFolderId, "repo");
    await gh.seed(ref, "main", { ".smartc-studio": marker, "a.smart.c": "x" });
    const res = await sync.importProject(ref, "main", "");
    const folder = fs.listFolderContents(fs.rootFolderId).folders.find((f) => f.id === res.projectId)!;
    expect(folder.metadata.name).toBe(uniqueName("repo", ["repo"]));
  });

  it("probe lists markers, nested ones and folder stats", async () => {
    const { gh, sync } = setup();
    await gh.seed(ref, "main", {
      ".smartc-studio": marker,
      "x/.smartc-studio": marker,
      "x/b.smart.c": "b",
      "a.smart.c": "a",
      "p.json": "{}",
      "y/z/c.md": "c",
    });
    const probe = await sync.probe(ref, "main");
    expect(probe.markers.map((m) => m.folder)).toEqual(["", "x"]);
    expect(probe.nested).toEqual(["x"]);
    expect(probe.branches).toEqual(["main"]);
    expect(probe.defaultBranch).toBe("main");
    expect(probe.canPush).toBe(true);
    expect(probe.folders).toEqual(["", "x", "y", "y/z"]);
    expect(probe.folderStats("")).toEqual({ tracked: 2, skipped: 1 });
  });

  it("probes an empty repo without branches or markers", async () => {
    const { gh, sync } = setup();
    gh.createEmptyRepo(ref, "trunk");
    const probe = await sync.probe(ref, "trunk");
    expect(probe).toMatchObject({ branches: [], defaultBranch: "trunk", markers: [], nested: [], folders: [""] });
  });

  it("initialize commits only the marker with the fixed message, also on an empty repo", async () => {
    const { gh, sync } = setup();
    await gh.seed(ref, "main", { "c/a.smart.c": "x" });
    await sync.initialize(ref, "main", "c");
    expect(gh.files(ref, "main")).toEqual({ "c/a.smart.c": "x", "c/.smartc-studio": marker });
    expect(gh.commitMessage(gh.commitsOn(ref, "main")[0])).toBe("Initialize SmartC Studio project");

    const empty: RepoRef = { owner: "o", repo: "empty" };
    gh.createEmptyRepo(empty, "trunk");
    await sync.initialize(empty, null, "");
    expect(gh.files(empty, "trunk")).toEqual({ ".smartc-studio": marker });
  });

  it("initialize overwrites an invalid marker", async () => {
    const { gh, sync } = setup();
    await gh.seed(ref, "main", { "c/.smartc-studio": "nope" });
    await sync.initialize(ref, "main", "c");
    const result = parseMarker(gh.files(ref, "main")["c/.smartc-studio"]);
    expect(result).toEqual({ ok: true, marker: { format: 1 } });
  });

  it("initialize leaves a valid marker alone", async () => {
    const { gh, sync } = setup();
    const valid = serializeMarker({ format: 2, extra: true });
    await gh.seed(ref, "main", { "c/.smartc-studio": valid });
    const before = gh.commitsOn(ref, "main");
    await sync.initialize(ref, "main", "c");
    expect(gh.commitsOn(ref, "main")).toEqual(before);
    expect(gh.files(ref, "main")["c/.smartc-studio"]).toBe(valid);
  });

  it("initialize reports a marker that changed on GitHub meanwhile as marker_changed", async () => {
    const gh = new FakeGitHub();
    await gh.seed(ref, "main", { "c/.smartc-studio": "nope" });
    const racing = new Proxy(gh, {
      get(target, prop) {
        if (prop === "putFile") {
          return async (...args: Parameters<GitProvider["putFile"]>) => {
            await gh.seed(ref, "main", { "c/.smartc-studio": "someone else" });
            return gh.putFile(...args);
          };
        }
        const value = Reflect.get(target, prop);
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    const { sync } = setup(() => racing);
    const err = await codeOf(sync.initialize(ref, "main", "c"));
    expect(err.code).toBe("marker_changed");
    expect(gh.files(ref, "main")["c/.smartc-studio"]).toBe("someone else");
  });

  it("initialize creates a new nested folder with exactly one commit holding only its marker", async () => {
    const { gh, sync } = setup();
    const head = await gh.seed(ref, "main", { "contracts/a/.smartc-studio": marker, "contracts/a/a.smart.c": "a" });
    const before = gh.files(ref, "main");
    await sync.initialize(ref, "main", "contracts/b");
    const commits = gh.commitsOn(ref, "main");
    expect(commits.length).toBe(2);
    expect(commits[1]).toBe(head);
    expect(gh.files(ref, "main")).toEqual({ ...before, "contracts/b/.smartc-studio": marker });
  });

  it("initialize refuses a folder above or below another marker without committing", async () => {
    const { gh, sync } = setup();
    const head = await gh.seed(ref, "main", { "contracts/a/.smartc-studio": marker, "x/.smartc-studio": "nope" });
    for (const folder of ["contracts/a/sub", "contracts", "", "x/y"]) {
      expect((await codeOf(sync.initialize(ref, "main", folder))).code).toBe("nested_markers");
    }
    expect(gh.commitsOn(ref, "main")).toEqual([head]);
  });

  it("initialize refuses a folder at or below a remote file and names the file", async () => {
    const { gh, sync } = setup();
    const head = await gh.seed(ref, "main", { LICENSE: "MIT", "docs/guide": "text" });
    const below = await codeOf(sync.initialize(ref, "main", "LICENSE/x"));
    expect(below.code).toBe("folder_taken");
    expect(below.detail?.paths).toEqual(["LICENSE"]);
    const at = await codeOf(sync.initialize(ref, "main", "docs/guide"));
    expect(at.code).toBe("folder_taken");
    expect(at.detail?.paths).toEqual(["docs/guide"]);
    expect(gh.commitsOn(ref, "main")).toEqual([head]);
  });

  it("initialize refuses a folder path that is not normalized, without committing", async () => {
    const { gh, sync } = setup();
    const head = await gh.seed(ref, "main", { "x/.smartc-studio": marker, "contracts/a/.smartc-studio": marker });
    for (const folder of ["contracts/a/../b", "x/..", "/a", "a/", " a", "a//b", "./a", "a\\b"]) {
      expect((await codeOf(sync.initialize(ref, "main", folder))).code).toBe("invalid_folder");
    }
    expect(gh.commitsOn(ref, "main")).toEqual([head]);

    const empty: RepoRef = { owner: "o", repo: "empty" };
    gh.createEmptyRepo(empty);
    expect((await codeOf(sync.initialize(empty, null, "x/.."))).code).toBe("invalid_folder");
    expect(gh.commitsOn(empty, "main")).toEqual([]);
  });

  it("probe tells files, folders and missing paths apart", async () => {
    const { gh, sync } = setup();
    await gh.seed(ref, "main", { LICENSE: "MIT", "a/b/c.ts": "c" });
    const probe = await sync.probe(ref, "main");
    expect(probe.pathKind("")).toBe("tree");
    expect(probe.pathKind("LICENSE")).toBe("blob");
    expect(probe.pathKind("a")).toBe("tree");
    expect(probe.pathKind("a/b")).toBe("tree");
    expect(probe.pathKind("a/b/c.ts")).toBe("blob");
    expect(probe.pathKind("nope")).toBeNull();

    gh.createEmptyRepo({ owner: "o", repo: "empty" });
    expect((await sync.probe({ owner: "o", repo: "empty" }, "main")).pathKind("")).toBe("tree");
  });

  it("needs a token", async () => {
    const { sync } = setup(() => {
      throw new GitSyncError("no_token", "");
    });
    expect((await codeOf(sync.probe(ref, "main"))).code).toBe("no_token");
  });
});
