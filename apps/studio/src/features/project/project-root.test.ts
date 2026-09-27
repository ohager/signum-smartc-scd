import { describe, it, expect } from "bun:test";
import { findProjectOfFolder, type FolderTree } from "./project-root";

/** projects: vault → src → lib; and a second project, empty. */
const tree: FolderTree = {
  listFolderContents: (id?: string) =>
    ({
      undefined: { folders: [{ id: "vault" }, { id: "spare" }], files: [] },
      vault: { folders: [{ id: "src" }], files: [] },
      src: { folders: [{ id: "lib" }], files: [] },
      lib: { folders: [], files: [] },
      spare: { folders: [], files: [] },
    })[id ?? "undefined"]!,
};

describe("findProjectOfFolder", () => {
  it("answers with the folder itself when it is already a project", () => {
    expect(findProjectOfFolder(tree, "vault")).toBe("vault");
  });

  it("climbs to the project from a subfolder", () => {
    expect(findProjectOfFolder(tree, "src")).toBe("vault");
  });

  it("climbs from any depth", () => {
    expect(findProjectOfFolder(tree, "lib")).toBe("vault");
  });

  it("finds nothing for a folder that is not in the tree", () => {
    // A stale URL, or a project another tab deleted. Never throws.
    expect(findProjectOfFolder(tree, "ghost")).toBeNull();
  });
});
