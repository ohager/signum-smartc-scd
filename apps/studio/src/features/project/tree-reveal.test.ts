import { describe, it, expect } from "bun:test";
import { findFolderChainToFile, type FolderTree } from "./tree-reveal";

/** `contents` is keyed by folder id; "" is the root folder. */
function fakeTree(
  contents: Record<string, { folders?: string[]; files?: string[] }>,
): FolderTree {
  return {
    listFolderContents(folderId = "") {
      const entry = contents[folderId];
      if (!entry) throw new Error(`Folder not found: ${folderId}`);
      return {
        folders: (entry.folders ?? []).map((id) => ({ id })),
        files: (entry.files ?? []).map((id) => ({ id })),
      };
    },
  };
}

describe("findFolderChainToFile", () => {
  it("returns the project id for a file directly in a project", () => {
    const tree = fakeTree({
      "": { folders: ["p1"] },
      p1: { files: ["f1"] },
    });
    expect(findFolderChainToFile(tree, "f1")).toEqual(["p1"]);
  });

  it("returns the full chain for a deeply nested file", () => {
    const tree = fakeTree({
      "": { folders: ["p1", "p2"] },
      p1: { files: ["other"] },
      p2: { folders: ["a"] },
      a: { folders: ["b"], files: ["x"] },
      b: { files: ["f1"] },
    });
    expect(findFolderChainToFile(tree, "f1")).toEqual(["p2", "a", "b"]);
  });

  it("skips sibling branches that do not contain the file", () => {
    const tree = fakeTree({
      "": { folders: ["p1"] },
      p1: { folders: ["a", "b"] },
      a: { files: ["nope"] },
      b: { files: ["f1"] },
    });
    expect(findFolderChainToFile(tree, "f1")).toEqual(["p1", "b"]);
  });

  it("returns empty when the file is unknown", () => {
    const tree = fakeTree({
      "": { folders: ["p1"] },
      p1: { files: ["f1"] },
    });
    expect(findFolderChainToFile(tree, "missing")).toEqual([]);
  });

  it("ignores files sitting directly in the root", () => {
    const tree = fakeTree({
      "": { folders: ["p1"], files: ["stray"] },
      p1: { files: ["f1"] },
    });
    expect(findFolderChainToFile(tree, "stray")).toEqual([]);
  });
});
