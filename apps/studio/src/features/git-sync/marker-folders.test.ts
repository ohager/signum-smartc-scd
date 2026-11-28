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

  it("suggests a sibling of the first valid marker folder, named after the project", () => {
    expect(suggestNewFolder({ markers: [ok("contracts/a")] }, "B")).toBe("contracts/b");
    expect(suggestNewFolder({ markers: [] }, "B")).toBe("b");
    expect(suggestNewFolder({ markers: [ok("x")] }, "B")).toBe("b");
    expect(suggestNewFolder({ markers: [ok("")] }, "B")).toBe("b");
    expect(suggestNewFolder({ markers: [{ folder: "bad/a", marker: null, error: "x" }, ok("c/a")] }, "B")).toBe("c/b");
  });

  it("appends a number when the suggestion is taken by a marker", () => {
    expect(suggestNewFolder({ markers: [ok("contracts/a"), ok("contracts/b")] }, "B")).toBe("contracts/b-2");
    expect(suggestNewFolder({ markers: [ok("contracts/a"), ok("contracts/b"), ok("contracts/b-2")] }, "B")).toBe(
      "contracts/b-3",
    );
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
