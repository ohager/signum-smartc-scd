import { describe, it, expect } from "bun:test";
import { diffModelPaths } from "./diff-model-paths";

describe("diffModelPaths", () => {
  it("gives the two sides different paths", () => {
    const p = diffModelPaths("cp1", "src/a.smart.c", 1);
    expect(p.original).not.toBe(p.modified);
  });
  it("differs per opening so a reopen never meets a disposed model", () => {
    expect(diffModelPaths("cp1", "a.c", 1)).not.toEqual(diffModelPaths("cp1", "a.c", 2));
  });
  it("differs per round and file", () => {
    expect(diffModelPaths("cp1", "a.c", 1).original).not.toBe(diffModelPaths("cp2", "a.c", 1).original);
    expect(diffModelPaths("cp1", "a.c", 1).original).not.toBe(diffModelPaths("cp1", "b.c", 1).original);
  });
  it("keeps the file name last so Monaco can still infer a language, and encodes unsafe characters", () => {
    const p = diffModelPaths("cp 1", "dir/my file#.smart.c", 3);
    expect(p.original.endsWith("my%20file%23.smart.c")).toBe(true);
    expect(p.original.startsWith("inmemory://assistant-diff/")).toBe(true);
    expect(p.original).not.toContain(" ");
  });
});
