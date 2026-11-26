import { describe, expect, it } from "bun:test";
import { importSuggestions } from "./import-suggestions";

const paths = [
  "/proj/c.smart.c",
  "/proj/c.asm",
  "/proj/tests/lib.ts",
  "/proj/tests/context.ts",
  "/proj/tests/a.test.ts",
  "/proj/tests/b.test.ts",
  "/proj/tests/sub/deep.ts",
  "/other/x.ts",
  "/other/y.smart.c",
];
const open = "/proj/tests/a.test.ts";
const sameFolder = [
  { label: "sub/", insertText: "sub/", kind: "folder" },
  { label: "b.test", insertText: "b.test", kind: "module" },
  { label: "context", insertText: "context", kind: "module" },
  { label: "lib", insertText: "lib", kind: "module" },
];

describe("importSuggestions", () => {
  it('lists the open file\'s folder for "./"', () => expect(importSuggestions(open, "./", paths)).toEqual(sameFolder));

  it("ignores the partial last segment", () => expect(importSuggestions(open, "./li", paths)).toEqual(sameFolder));

  it('lists the parent folder for "../" with contracts as ?raw', () =>
    expect(importSuggestions(open, "../", paths)).toEqual([
      { label: "tests/", insertText: "tests/", kind: "folder" },
      { label: "c.smart.c?raw", insertText: "c.smart.c?raw", kind: "contract" },
    ]));

  it("resolves nested segments", () => {
    expect(importSuggestions(open, "../tests/", paths)).toEqual(sameFolder);
    expect(importSuggestions(open, "./sub/", paths)).toEqual([{ label: "deep", insertText: "deep", kind: "module" }]);
  });

  it("never above the project root", () => {
    expect(importSuggestions(open, "../../", paths)).toEqual([]);
    expect(importSuggestions("/proj/c.ts", "../", paths)).toEqual([]);
  });

  it("nothing for bare specifiers", () => {
    expect(importSuggestions(open, "vitest", paths)).toEqual([]);
    expect(importSuggestions(open, "", paths)).toEqual([]);
  });

  it("never another project", () => {
    for (const typed of ["../", "./"]) {
      // Exact labels: a substring check for "x" would also hit "context".
      const labels = importSuggestions(open, typed, paths).map((s) => s.label);
      expect(labels).not.toContain("x");
      expect(labels).not.toContain("y.smart.c?raw");
    }
  });
});
