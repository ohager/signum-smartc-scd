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
    });
    const probe = await sync.probe(ref, "main");
    expect(probe.markers.map((m) => m.folder)).toEqual(["", "x"]);
    expect(probe.nested).toEqual(["x"]);
    expect(probe.branches).toEqual(["main"]);
    expect(probe.defaultBranch).toBe("main");
    expect(probe.canPush).toBe(true);
    expect(probe.folderStats("")).toEqual({ tracked: 1, skipped: 1 });
  });

  it("probes an empty repo without branches or markers", async () => {
    const { gh, sync } = setup();
    gh.createEmptyRepo(ref, "trunk");
    const probe = await sync.probe(ref, "trunk");
    expect(probe).toMatchObject({ branches: [], defaultBranch: "trunk", markers: [], nested: [] });
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

  it("needs a token", async () => {
    const { sync } = setup(() => {
      throw new GitSyncError("no_token", "");
    });
    expect((await codeOf(sync.probe(ref, "main"))).code).toBe("no_token");
  });
});
