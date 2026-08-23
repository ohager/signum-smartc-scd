import { describe, it, expect } from "bun:test";
import { findTests } from "./find-tests";

describe("findTests", () => {
  it("finds a top-level test", () => {
    expect(findTests(`it("counts up", () => {});`)).toEqual([
      { name: "counts up", path: ["counts up"], line: 1, mode: "run" },
    ]);
  });

  it("accepts test as an alias for it", () => {
    expect(findTests(`test("t", () => {});`)[0].name).toBe("t");
  });

  it("records the enclosing describe in the path", () => {
    const found = findTests(`describe("Counter", () => {\n  it("counts up", () => {});\n});`);
    expect(found).toEqual([
      { name: "counts up", path: ["Counter", "counts up"], line: 2, mode: "run" },
    ]);
  });

  it("nests describes", () => {
    const src = `describe("a", () => {\n  describe("b", () => {\n    it("c", () => {});\n  });\n});`;
    expect(findTests(src)[0].path).toEqual(["a", "b", "c"]);
  });

  it("finds several tests in order", () => {
    const src = `describe("s", () => {\n  it("one", () => {});\n  it("two", () => {});\n});`;
    expect(findTests(src).map((t) => t.name)).toEqual(["one", "two"]);
  });

  it("does not descend into a test body", () => {
    // A nested `it` is not a thing, and treating one as a test would produce a
    // path that no runner would ever match.
    const src = `it("outer", () => {\n  it("inner", () => {});\n});`;
    expect(findTests(src).map((t) => t.name)).toEqual(["outer"]);
  });

  it("records modifiers", () => {
    expect(findTests(`it.skip("s", () => {});`)[0].mode).toBe("skip");
    expect(findTests(`it.only("o", () => {});`)[0].mode).toBe("only");
    expect(findTests(`it.todo("t");`)[0].mode).toBe("todo");
  });

  it("carries a describe modifier without applying it to the test", () => {
    // The test's own mode is what the gutter shows; suite-level skipping is the
    // runner's business, not the scanner's.
    const src = `describe.skip("s", () => {\n  it("t", () => {});\n});`;
    expect(findTests(src)[0].mode).toBe("run");
  });

  it("ignores a call that is not a test", () => {
    expect(findTests(`tb.runScenario("x", () => {});`)).toEqual([]);
  });

  it("ignores a test whose name is computed", () => {
    // A template literal has no name until it runs, so the scan cannot know it.
    expect(findTests("for (const c of cases) it(`case ${c}`, () => {});")).toEqual([]);
  });

  it("returns nothing for source it cannot parse", () => {
    expect(findTests(`it("t", () => {`)).toEqual([]);
  });

  it("finds tests written in the compiled form", () => {
    // What TypeScript actually emits for `import { it } from "vitest"`.
    const src = `(0, vitest_1.describe)("Counter", () => {\n  (0, vitest_1.it)("counts up", () => {});\n});`;
    expect(findTests(src)).toEqual([
      { name: "counts up", path: ["Counter", "counts up"], line: 2, mode: "run" },
    ]);
  });

  it("finds a modifier in the compiled form", () => {
    expect(findTests(`(0, vitest_1.it).skip("s", () => {});`)[0].mode).toBe("skip");
  });

  it("finds a test called through a namespace import", () => {
    expect(findTests(`vitest_1.it("t", () => {});`)[0].name).toBe("t");
  });

  it("maps lines through the sourcemap when one is given", () => {
    // "AAIA" decodes to: column 0, source 0, original line +4 → line 5.
    const map = JSON.stringify({
      version: 3,
      file: "a.js",
      sources: ["a.ts"],
      names: [],
      mappings: "AAIA",
    });
    expect(findTests(`it("t", () => {});`, map)[0].line).toBe(5);
  });

  it("falls back to the generated line when the map is unusable", () => {
    expect(findTests(`it("t", () => {});`, "{not json")[0].line).toBe(1);
  });
});
