import { describe, expect, it } from "bun:test";
import { selectTracked, toRepoPath } from "./tracked.ts";

const resolve = (n: string) => (n.endsWith(".smart.c") || n.endsWith(".md") ? "x" : null);

describe("tracked", () => {
  it("keeps tracked blobs below the folder, relative, without the marker", () => {
    const r = selectTracked(
      [
        { path: "c/.smartc-studio", sha: "m", type: "blob" },
        { path: "c/a.smart.c", sha: "1", type: "blob" },
        { path: "c/docs/r.md", sha: "2", type: "blob" },
        { path: "c/pkg.json", sha: "3", type: "blob" },
        { path: "c/docs", sha: "t", type: "tree" },
        { path: "other/b.smart.c", sha: "4", type: "blob" },
      ],
      "c",
      resolve,
    );
    expect(r).toEqual({
      tracked: [
        { relPath: "a.smart.c", sha: "1" },
        { relPath: "docs/r.md", sha: "2" },
      ],
      skipped: ["pkg.json"],
    });
  });
  it("treats folder '' as the repo root", () => {
    expect(
      selectTracked([{ path: "a.smart.c", sha: "1", type: "blob" }], "", resolve).tracked,
    ).toEqual([{ relPath: "a.smart.c", sha: "1" }]);
  });
  it("joins repo paths", () => {
    expect(toRepoPath("", "a/b.ts")).toBe("a/b.ts");
    expect(toRepoPath("c", "a/b.ts")).toBe("c/a/b.ts");
  });
});
