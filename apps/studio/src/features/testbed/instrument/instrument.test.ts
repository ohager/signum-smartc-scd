import { describe, it, expect } from "bun:test";
import { instrument } from "./instrument";

/** Every instrumented file must have exactly as many lines as its input. */
function expectLinePreserved(input: string) {
  const output = instrument(input);
  expect(output.split("\n")).toHaveLength(input.split("\n").length);
  return output;
}

describe("instrument", () => {
  it("wraps a const initialiser", () => {
    const out = expectLinePreserved(`const counter = getMemory("counter");`);
    expect(out).toBe(`const counter = __v(1,"counter", getMemory("counter"));`);
  });

  it("wraps let and var too", () => {
    expect(instrument(`let a = 1;`)).toBe(`let a = __v(1,"a", 1);`);
    expect(instrument(`var b = 2;`)).toBe(`var b = __v(1,"b", 2);`);
  });

  it("wraps a whole assignment, so the recorded value is the result", () => {
    const out = expectLinePreserved(`total = total + n;`);
    expect(out).toBe(`__v(1,"total", total = total + n);`);
  });

  it("wraps a compound assignment as a whole, for the same reason", () => {
    expect(instrument(`total += n;`)).toBe(`__v(1,"total", total += n);`);
  });

  it("uses the line each statement is actually on", () => {
    const out = expectLinePreserved(`const a = 1;\nconst b = 2;\n\nconst c = 3;`);
    expect(out).toContain(`__v(1,"a", 1)`);
    expect(out).toContain(`__v(2,"b", 2)`);
    expect(out).toContain(`__v(4,"c", 3)`);
  });

  it("uses the line the binding starts on for a multi-line initialiser", () => {
    const out = expectLinePreserved(`const counter =\n  getMemory(\n    "counter"\n  );`);
    expect(out).toContain(`__v(1,"counter",`);
  });

  it("nests correctly, outermost wrap outermost", () => {
    // Asserts the nesting order rather than an exact string: acorn's ranges for a
    // parenthesised expression exclude the parens, so the precise placement of
    // `(` is an implementation detail. The invariant that matters is that the
    // declarator's wrap encloses the assignment's.
    const out = expectLinePreserved(`const a = (b = 1);`);
    expect(out.indexOf(`__v(1,"a"`)).toBeGreaterThanOrEqual(0);
    expect(out.indexOf(`__v(1,"a"`)).toBeLessThan(out.indexOf(`__v(1,"b"`));
  });

  it("skips destructuring, which has no single name", () => {
    const out = expectLinePreserved(`const { a, b } = obj;`);
    expect(out).toBe(`const { a, b } = obj;`);
  });

  it("skips a declaration with no initialiser", () => {
    expect(instrument(`let a;`)).toBe(`let a;`);
  });

  it("instruments inside functions and blocks", () => {
    const out = expectLinePreserved(`function f() {\n  const x = 1;\n}`);
    expect(out).toContain(`__v(2,"x", 1)`);
  });

  it("instruments a for-of body", () => {
    const out = expectLinePreserved(`for (const tx of txs) {\n  const r = send(tx);\n}`);
    expect(out).toContain(`__v(2,"r", send(tx))`);
  });

  it("leaves the loop variable of a for-of alone", () => {
    // `const tx of txs` is a binding pattern, not an initialiser.
    expect(instrument(`for (const tx of txs) {}`)).toBe(`for (const tx of txs) {}`);
  });

  it("returns the input unchanged when it cannot be parsed", () => {
    const broken = `const a = ;`;
    expect(instrument(broken)).toBe(broken);
  });

  it("maps a line through the sourcemap when one is given", () => {
    // A minimal map claiming generated line 1 came from original line 5.
    // "AAIA" decodes to: column 0, source 0, original line +4 (0-based → line 5), column 0.
    const map = JSON.stringify({
      version: 3,
      file: "a.js",
      sources: ["a.ts"],
      names: [],
      mappings: "AAIA",
    });
    const out = instrument(`const a = 1;`, map);
    expect(out).toBe(`const a = __v(5,"a", 1);`);
  });

  it("falls back to the generated line when the map is unusable", () => {
    expect(instrument(`const a = 1;`, "{not json")).toBe(`const a = __v(1,"a", 1);`);
  });
});
