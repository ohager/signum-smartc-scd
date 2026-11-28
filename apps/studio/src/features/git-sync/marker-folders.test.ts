import { describe, expect, it } from "bun:test";
import {
  checkNewFolder,
  importableFolders,
  nestedMarkerFolders,
  normalizeFolder,
  slugFolderName,
  suggestNewFolder,
} from "./marker-folders";

const ok = (folder: string, format = 1) => ({ folder, marker: { format } });

describe("marker folders", () => {
  it("excludes both the outer and the inner folder of a nesting", () => {
    const probe = { markers: [ok(""), ok("x"), ok("y")], nested: ["x"] };
    expect(nestedMarkerFolders(probe)).toEqual(["", "x"]);
    expect(importableFolders(probe)).toEqual(["y"]);
  });

  it("excludes invalid markers and newer formats", () => {
    const probe = { markers: [ok("a", 2), { folder: "b", marker: null, error: "bad" }, ok("c")], nested: [] };
    expect(importableFolders(probe)).toEqual(["c"]);
  });

  it("does not treat siblings with a shared prefix as nested", () => {
    expect(importableFolders({ markers: [ok("a"), ok("ab")], nested: [] })).toEqual(["a", "ab"]);
  });
});

describe("new folders", () => {
  it("normalizes a typed folder path or rejects it", () => {
    expect(normalizeFolder("contracts/b/")).toBe("contracts/b");
    expect(normalizeFolder(" a ")).toBe("a");
    expect(normalizeFolder("")).toBe("");
    for (const bad of ["/a", "a//b", "a/../b", "./a", "a\\b", "/", "a//", ".", ".."]) {
      expect(normalizeFolder(bad)).toBeNull();
    }
  });

  it("slugs a project name into a folder name", () => {
    expect(slugFolderName("Veridibloc - Item Contract")).toBe("veridibloc-item-contract");
    expect(slugFolderName("  ")).toBe("contract");
    expect(slugFolderName("..My/Token?..")).toBe("mytoken");
    expect(slugFolderName("Über Vertrag")).toBe("uber-vertrag");
  });

  /** A probe whose markers sit at `folders`, with the given blobs; folders are derived. */
  const repo = (markers: { folder: string; marker: { format: number } | null; error?: string }[], blobs: string[] = []) => {
    const files = new Set([...blobs, ...markers.map((m) => (m.folder ? `${m.folder}/.smartc-studio` : ".smartc-studio"))]);
    const trees = new Set([""]);
    for (const f of files) for (let i = f.indexOf("/"); i !== -1; i = f.indexOf("/", i + 1)) trees.add(f.slice(0, i));
    return {
      markers,
      nested: [],
      pathKind: (p: string) => (files.has(p) ? ("blob" as const) : trees.has(p) ? ("tree" as const) : null),
    };
  };

  it("suggests a sibling of the first valid marker folder, named after the project", () => {
    expect(suggestNewFolder(repo([ok("contracts/a")]), "B")).toBe("contracts/b");
    expect(suggestNewFolder(repo([]), "B")).toBe("b");
    expect(suggestNewFolder(repo([ok("x")]), "B")).toBe("b");
    expect(suggestNewFolder(repo([{ folder: "bad/a", marker: null, error: "x" }, ok("c/a")]), "B")).toBe("c/b");
  });

  it("appends a number when the suggestion is taken by a marker", () => {
    expect(suggestNewFolder(repo([ok("contracts/a"), ok("contracts/b")]), "B")).toBe("contracts/b-2");
    expect(suggestNewFolder(repo([ok("contracts/a"), ok("contracts/b"), ok("contracts/b-2")]), "B")).toBe(
      "contracts/b-3",
    );
  });

  it("skips candidates that already exist on GitHub, as a folder or a file", () => {
    expect(suggestNewFolder(repo([ok("contracts/a")], ["contracts/b/notes.md", "contracts/b-2"]), "B")).toBe(
      "contracts/b-3",
    );
    expect(suggestNewFolder(repo([], ["b", "b-2/x.ts"]), "B")).toBe("b-3");
  });

  it("falls back to the plain name when no numbered candidate can take a marker", () => {
    expect(suggestNewFolder(repo([ok("")]), "B")).toBe("b");
  });

  it("checks a new folder against markers and remote files", () => {
    const blobs = new Set(["LICENSE", "contracts/a/a.smart.c", "contracts/a/.smartc-studio"]);
    const trees = new Set(["", "contracts", "contracts/a"]);
    const probe = {
      markers: [ok("contracts/a")],
      nested: [],
      pathKind: (p: string) => (blobs.has(p) ? ("blob" as const) : trees.has(p) ? ("tree" as const) : null),
    };
    expect(checkNewFolder(probe, "contracts/a/sub")).toBe("nested");
    expect(checkNewFolder(probe, "contracts")).toBe("nested");
    expect(checkNewFolder(probe, "")).toBe("nested");
    expect(checkNewFolder(probe, "contracts/a")).toBe("has_marker");
    expect(checkNewFolder(probe, "LICENSE/x")).toBe("file_exists");
    expect(checkNewFolder(probe, "LICENSE")).toBe("file_exists");
    expect(checkNewFolder(probe, "a//b")).toBe("invalid");
    expect(checkNewFolder(probe, "contracts/b")).toBeNull();
    expect(checkNewFolder(probe, "other/deep/b")).toBeNull();
  });
});
