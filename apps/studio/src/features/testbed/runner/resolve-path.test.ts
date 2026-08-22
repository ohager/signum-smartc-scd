import { describe, it, expect } from "bun:test";
import { dirnameOf, normalizePath, resolveFrom } from "./resolve-path";

describe("resolve-path", () => {
  it("takes the directory of a file path", () => {
    expect(dirnameOf("/proj/tests/a.test.ts")).toBe("/proj/tests");
  });

  it("returns root for a file directly in root", () => {
    expect(dirnameOf("/a.test.ts")).toBe("/");
  });

  it("collapses . and .. segments", () => {
    expect(normalizePath("/proj/tests/../counter.smart.c")).toBe("/proj/counter.smart.c");
    expect(normalizePath("/proj/./tests/a.ts")).toBe("/proj/tests/a.ts");
  });

  it("resolves a sibling import", () => {
    expect(resolveFrom("/proj/tests/a.test.ts", "./context")).toBe("/proj/tests/context");
  });

  it("resolves a parent import", () => {
    expect(resolveFrom("/proj/tests/a.test.ts", "../counter.smart.c")).toBe("/proj/counter.smart.c");
  });
});
