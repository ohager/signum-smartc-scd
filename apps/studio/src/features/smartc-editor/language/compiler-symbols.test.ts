import { describe, it, expect } from "bun:test";
import { parseCompileError, analyzeWithCompiler } from "./compiler-symbols";

describe("parseCompileError", () => {
  it("parses standard 'At line' errors", () => {
    expect(parseCompileError("At line: 5:3. Unknown token 'foo'")).toEqual({
      line: 5,
      column: 3,
      message: "Unknown token 'foo'",
    });
  });

  it("falls back to line 1 for unrecognised messages", () => {
    const r = parseCompileError("Something exploded");
    expect(r.line).toBe(1);
    expect(r.column).toBe(1);
    expect(r.message).toBe("Something exploded");
  });
});

describe("analyzeWithCompiler", () => {
  it("returns compiler symbols for valid source", () => {
    const r = analyzeWithCompiler("#pragma maxAuxVars 1\nlong a, b, c; a=b/~c;");
    expect(r.error).toBeNull();
    expect(r.compiler).not.toBeNull();
    expect(r.compiler!.variables).toEqual(expect.arrayContaining(["a", "b", "c"]));
  });

  it("returns a parsed error for invalid source", () => {
    const r = analyzeWithCompiler("long ;;; broken");
    expect(r.compiler).toBeNull();
    expect(r.error).not.toBeNull();
    expect(typeof r.error!.message).toBe("string");
  });

  it("filters out internal compiler labels (double-underscore)", () => {
    const r = analyzeWithCompiler("#pragma maxAuxVars 2\nlong a;\nwhile (a) { a--; }");
    expect(r.compiler).not.toBeNull();
    expect(r.compiler!.labels.every((l) => !l.startsWith("__"))).toBe(true);
  });
});
