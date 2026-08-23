import { describe, it, expect } from "bun:test";
import { instrument } from "./instrument";

/**
 * Instrumentation only applies inside function bodies, so single-statement
 * fixtures are wrapped in one. The wrapper sits on line 1 and adds no newlines,
 * so the body's line numbers are unchanged.
 */
const inFn = (body: string) => `it("t", () => { ${body} });`;

/** Every instrumented file must have exactly as many lines as its input. */
function expectLinePreserved(input: string) {
  const output = instrument(input);
  expect(output.split("\n")).toHaveLength(input.split("\n").length);
  return output;
}

describe("instrument", () => {
  it("wraps a const initialiser", () => {
    const out = expectLinePreserved(inFn(`const counter = getMemory("counter");`));
    expect(out).toBe(inFn(`const counter = __v(1,"counter", getMemory("counter"));`));
  });

  it("wraps let and var too", () => {
    expect(instrument(inFn(`let a = 1;`))).toBe(inFn(`let a = __v(1,"a", 1);`));
    expect(instrument(inFn(`var b = 2;`))).toBe(inFn(`var b = __v(1,"b", 2);`));
  });

  it("wraps a whole assignment, so the recorded value is the result", () => {
    const out = expectLinePreserved(inFn(`total = total + n;`));
    expect(out).toBe(inFn(`__v(1,"total", total = total + n);`));
  });

  it("wraps a compound assignment as a whole, for the same reason", () => {
    expect(instrument(inFn(`total += n;`))).toBe(inFn(`__v(1,"total", total += n);`));
  });

  it("uses the line each statement is actually on", () => {
    const out = expectLinePreserved(inFn(`const a = 1;\nconst b = 2;\n\nconst c = 3;`));
    expect(out).toContain(`__v(1,"a", 1)`);
    expect(out).toContain(`__v(2,"b", 2)`);
    expect(out).toContain(`__v(4,"c", 3)`);
  });

  it("uses the line the binding starts on for a multi-line initialiser", () => {
    const out = expectLinePreserved(inFn(`const counter =\n  getMemory(\n    "counter"\n  );`));
    expect(out).toContain(`__v(1,"counter",`);
  });

  it("nests correctly, outermost wrap outermost", () => {
    // Asserts the nesting order rather than an exact string: acorn's ranges for a
    // parenthesised expression exclude the parens, so the precise placement of
    // `(` is an implementation detail. The invariant that matters is that the
    // declarator's wrap encloses the assignment's.
    const out = expectLinePreserved(inFn(`const a = (b = 1);`));
    expect(out.indexOf(`__v(1,"a"`)).toBeGreaterThanOrEqual(0);
    expect(out.indexOf(`__v(1,"a"`)).toBeLessThan(out.indexOf(`__v(1,"b"`));
  });

  it("skips destructuring, which has no single name", () => {
    const out = expectLinePreserved(inFn(`const { a, b } = obj;`));
    expect(out).toBe(inFn(`const { a, b } = obj;`));
  });

  it("skips a declaration with no initialiser", () => {
    expect(instrument(inFn(`let a;`))).toBe(inFn(`let a;`));
  });

  it("instruments inside functions and blocks", () => {
    const out = expectLinePreserved(`function f() {\n  const x = 1;\n}`);
    expect(out).toContain(`__v(2,"x", 1)`);
  });

  it("instruments a for-of body", () => {
    const out = expectLinePreserved(inFn(`for (const tx of txs) {\n  const r = send(tx);\n}`));
    expect(out).toContain(`__v(2,"r", send(tx))`);
  });

  it("leaves the loop variable of a for-of alone", () => {
    // `const tx of txs` is a binding pattern, not an initialiser.
    expect(instrument(inFn(`for (const tx of txs) {}`))).toBe(inFn(`for (const tx of txs) {}`));
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
    const out = instrument(inFn(`const a = 1;`), map);
    expect(out).toBe(inFn(`const a = __v(5,"a", 1);`));
  });

  it("falls back to the generated line when the map is unusable", () => {
    expect(instrument(inFn(`const a = 1;`), "{not json")).toBe(inFn(`const a = __v(1,"a", 1);`));
  });

  it("marks a completed assertion", () => {
    const out = expectLinePreserved(inFn(`expect(counter).toBe(2n);`));
    expect(out).toBe(inFn(`expect(counter).toBe(2n); __ok(1);`));
  });

  it("marks an assertion at the end of a long chain", () => {
    const out = expectLinePreserved(inFn(`expect(a).resolves.toBe(1);`));
    expect(out).toContain(`__ok(1);`);
  });

  it("uses the line the assertion starts on when it spans several", () => {
    const out = expectLinePreserved(inFn(`expect(tb.getMap(1n, 10n))\n  .toBe(1n);`));
    expect(out).toContain(`__ok(1);`);
    expect(out).not.toContain(`__ok(2);`);
  });

  it("does not mark a call that merely mentions expect deeper in", () => {
    const out = expectLinePreserved(inFn(`assertThat(expect(a));`));
    expect(out).not.toContain("__ok(");
  });

  it("does not mark an ordinary call", () => {
    const out = expectLinePreserved(inFn(`tb.runScenario(txs);`));
    expect(out).not.toContain("__ok(");
  });

  it("marks assertions inside a test body", () => {
    const src = `it("t", () => {\n  expect(1n).toBe(1n);\n});`;
    const out = expectLinePreserved(src);
    expect(out).toContain(`__ok(2);`);
  });

  it("marks an assertion and wraps a binding on the same line independently", () => {
    const out = expectLinePreserved(inFn(`const a = 1; expect(a).toBe(1);`));
    expect(out).toBe(inFn(`const a = __v(1,"a", 1); expect(a).toBe(1); __ok(1);`));
  });
});

describe("instrument scope", () => {
  it("leaves a compiled import alone", () => {
    // TypeScript compiles `import { it } from "vitest"` to exactly this, so an
    // instrumented import would annotate the line with the whole module object.
    const src = `const vitest_1 = require("vitest");`;
    expect(instrument(src)).toBe(src);
  });

  it("leaves an import wrapped in a TS helper alone", () => {
    const src = `const code_1 = __importDefault(require("./c.smart.c?raw"));`;
    expect(instrument(src)).toBe(src);
  });

  it("leaves a module-level constant alone", () => {
    const src = `const Scenario = [{ blockheight: 1, amount: 2n, sender: 10n }];`;
    expect(instrument(src)).toBe(src);
  });

  it("leaves a module-level assignment alone", () => {
    const src = `total = 1;`;
    expect(instrument(src)).toBe(src);
  });

  it("annotates inside an it() body", () => {
    const out = instrument(`it("t", () => {\n  const a = 1;\n});`);
    expect(out).toContain(`__v(2,"a", 1)`);
  });

  it("annotates inside a beforeEach, which runs as part of each test", () => {
    const out = instrument(`beforeEach(() => {\n  testbed = build();\n});`);
    expect(out).toContain(`__v(2,"testbed", testbed = build())`);
  });

  it("annotates inside a describe callback", () => {
    const out = instrument(`describe("s", () => {\n  const shared = 1;\n});`);
    expect(out).toContain(`__v(2,"shared", 1)`);
  });

  it("annotates inside a helper function, which tests call into", () => {
    // No `export` here: the instrumenter only ever sees emitted CommonJS, where
    // an exported helper is a plain declaration plus an `exports.build = build`.
    const out = instrument(`function build() {\n  const tb = make();\n  return tb;\n}`);
    expect(out).toContain(`__v(2,"tb", make())`);
  });

  it("skips a top-level assertion, which is not part of any test", () => {
    const src = `expect(1).toBe(1);`;
    expect(instrument(src)).toBe(src);
  });
});

describe("instrument against compiled TypeScript", () => {
  // TypeScript rewrites every imported call as `(0, ns.fn)(...)`, so a matcher
  // that only recognises a bare `expect` identifier never fires on real output.
  it("marks an assertion compiled from an import", () => {
    const out = instrument(`it("t", () => {\n  (0, vitest_1.expect)(a).toBe(1);\n});`);
    expect(out).toContain(`__ok(2);`);
  });

  it("marks a compiled assertion with a longer matcher chain", () => {
    const out = instrument(`it("t", () => {\n  (0, vitest_1.expect)(a).resolves.toBe(1);\n});`);
    expect(out).toContain(`__ok(2);`);
  });

  it("still marks a bare assertion", () => {
    const out = instrument(`it("t", () => {\n  expect(a).toBe(1);\n});`);
    expect(out).toContain(`__ok(2);`);
  });

  it("does not mark an ordinary compiled call", () => {
    const out = instrument(`it("t", () => {\n  (0, testbed_1.build)(a);\n});`);
    expect(out).not.toContain("__ok(");
  });

  it("does not mark a method call on a local object", () => {
    const out = instrument(`it("t", () => {\n  tb.runScenario(txs);\n});`);
    expect(out).not.toContain("__ok(");
  });
});
