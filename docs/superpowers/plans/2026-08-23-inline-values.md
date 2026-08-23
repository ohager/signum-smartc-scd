# Inline Values Implementation Plan (Plan 4a)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a test run, show the value each line produced directly in the editor, so a failing contract test explains itself without leaving Studio.

**Architecture:** Rewrite the JavaScript Monaco emits so every variable binding is wrapped in a `__v(line, name, value)` call and every assertion is followed by an `__ok(line)` marker. The rewrite is *line-preserving* — an instrumented file has exactly the same number of lines as its input — which keeps the existing TS→JS sourcemap valid and lets line numbers be resolved once, at instrument time, rather than at runtime. Captured values are serialised immediately, collected per test, shipped to the main thread on `test:end`, and rendered as Monaco inline decorations.

**Tech Stack:** Bun, TypeScript, React 19, jotai, Monaco, acorn, magic-string, `@jridgewell/trace-mapping` (already a dependency).

**Spec:** `docs/superpowers/specs/2026-08-23-test-inline-values-design.md`

---

## Scope

**In:** instrumentation, value capture with caps, per-test traces, inline rendering, active-test selection via the results panel, inline sourcemaps and DevTools guidance.

**Out (Plan 4b):** static test discovery, gutter play buttons, cursor-follows-test, the single-test filter, per-test Debug.

## File Structure

| Path | Responsibility |
|---|---|
| `src/features/testbed/serialize-value.ts` | One value → a capped display string. Replaces two duplicated formatters. |
| `src/features/testbed/runner/trace.ts` | The `__v`/`__ok` sinks, the caps, and the per-test `TestTrace`. |
| `src/features/testbed/instrument/instrument.ts` | Line-preserving rewrite of emitted JS. |
| `src/features/testbed/annotation.ts` | A `LineTrace` → the text and hover shown in the editor. |
| `src/features/testbed/test-trace-store.ts` | Jotai atoms: traces by test id, and the active test. |
| `src/features/testbed/ui/use-value-decorations.ts` | Renders a file's trace as Monaco inline decorations. |
| `src/features/testbed/ui/devtools-help.tsx` | The DevTools guidance popover. |

Modified: `runner/types.ts`, `runner/module-registry.ts`, `runner/run-request.ts`, `source-position.ts`, `use-test-run.ts`, `test-run-model.ts`, `ui/test-file-editor.tsx`, `ui/test-results-panel.tsx`.

---

## Task 1: Serialising a value

**Files:**
- Create: `src/features/testbed/serialize-value.ts`
- Create: `src/features/testbed/serialize-value.test.ts`

This replaces two near-duplicates: `formatValue` in `ui/test-results-panel.tsx` and `formatArg` in `runner/run-request.ts`. They differ in one way that matters — console output must print `hi`, not `"hi"`, while a value annotation must quote strings so `hi` is distinguishable from a bare identifier. Hence the `quoteStrings` option, applied only at the top level, exactly as Node's `util.inspect` behaves.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/serialize-value.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { serializeValue } from "./serialize-value";

describe("serializeValue", () => {
  it("renders bigints with the n suffix", () => {
    expect(serializeValue(5n)).toBe("5n");
  });

  it("quotes strings by default", () => {
    expect(serializeValue("hi")).toBe('"hi"');
  });

  it("leaves top-level strings bare when asked, for console output", () => {
    expect(serializeValue("hi", { quoteStrings: false })).toBe("hi");
  });

  it("still quotes strings nested inside a structure", () => {
    expect(serializeValue({ a: "hi" }, { quoteStrings: false })).toBe('{ a: "hi" }');
  });

  it("names the constructor of a class instance", () => {
    class SimulatorTestbed {}
    expect(serializeValue(new SimulatorTestbed())).toBe("SimulatorTestbed {}");
  });

  it("renders plain objects without a prefix", () => {
    expect(serializeValue({ a: 1n })).toBe("{ a: 1n }");
  });

  it("renders arrays", () => {
    expect(serializeValue([1n, 2n])).toBe("[1n, 2n]");
  });

  it("marks a cycle instead of recursing forever", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(serializeValue(a)).toBe("{ self: [Circular] }");
  });

  it("does not treat a repeated sibling reference as a cycle", () => {
    const shared = { n: 1n };
    expect(serializeValue({ a: shared, b: shared })).toBe("{ a: { n: 1n }, b: { n: 1n } }");
  });

  it("stops at the depth cap", () => {
    expect(serializeValue({ a: { b: { c: { d: 1 } } } })).toBe("{ a: { b: { c: [Object] } } }");
  });

  it("truncates past the length cap", () => {
    const out = serializeValue({ s: "x".repeat(500) }, { maxLength: 20 });
    expect(out).toHaveLength(20);
    expect(out.endsWith("…")).toBe(true);
  });

  it("survives a throwing getter, and keeps the other keys", () => {
    const obj = {
      good: 1n,
      get bad(): never {
        throw new Error("nope");
      },
    };
    expect(serializeValue(obj)).toBe("{ good: 1n, bad: <throws> }");
  });

  it("renders undefined and null", () => {
    expect(serializeValue(undefined)).toBe("undefined");
    expect(serializeValue(null)).toBe("null");
  });

  it("renders Map and Set by size, not contents", () => {
    expect(serializeValue(new Map([[1, 2]]))).toBe("Map(1)");
    expect(serializeValue(new Set([1, 2]))).toBe("Set(2)");
  });

  it("renders an Error by name and message", () => {
    expect(serializeValue(new TypeError("bad"))).toBe("TypeError: bad");
  });

  it("renders a function by name", () => {
    expect(serializeValue(function send() {})).toBe("[Function: send]");
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/features/testbed/serialize-value.test.ts`
Expected: FAIL — `Cannot find module './serialize-value'`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/serialize-value.ts`:

```ts
const MAX_DEPTH = 3;
const MAX_LENGTH = 200;

export interface SerializeOptions {
  /** Quote a top-level string. False for console output, where `hi` beats `"hi"`. */
  quoteStrings?: boolean;
  maxLength?: number;
}

/**
 * Renders any value as a short, single-line display string.
 *
 * Called at capture time rather than render time: holding a reference to a live
 * object and formatting it later would show its final state rather than its
 * state at the line being annotated, which is the exact lie inline values exist
 * to prevent.
 *
 * Total by construction — a throwing getter, a cycle or a hostile proxy yields a
 * placeholder, never an exception that would escape into user code.
 */
export function serializeValue(value: unknown, options: SerializeOptions = {}): string {
  const { quoteStrings = true, maxLength = MAX_LENGTH } = options;
  const seen = new WeakSet<object>();

  function walk(v: unknown, depth: number): string {
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "string") return depth === 0 && !quoteStrings ? v : JSON.stringify(v);
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "function") return v.name ? `[Function: ${v.name}]` : "[Function]";
    if (typeof v !== "object") return String(v);

    // Only a genuine cycle is [Circular]; the entry is released on the way out so
    // two siblings pointing at the same object both render in full.
    if (seen.has(v)) return "[Circular]";
    if (depth >= MAX_DEPTH) return Array.isArray(v) ? "[Array]" : "[Object]";

    seen.add(v);
    try {
      if (Array.isArray(v)) return `[${v.map((item) => walk(item, depth + 1)).join(", ")}]`;
      if (v instanceof Map) return `Map(${v.size})`;
      if (v instanceof Set) return `Set(${v.size})`;
      if (v instanceof Error) return `${v.name}: ${v.message}`;

      const entries: string[] = [];
      for (const key of Object.keys(v)) {
        let rendered: string;
        try {
          rendered = walk((v as Record<string, unknown>)[key], depth + 1);
        } catch {
          rendered = "<throws>";
        }
        entries.push(`${key}: ${rendered}`);
      }

      const ctor = (v as object).constructor?.name;
      const prefix = ctor && ctor !== "Object" ? `${ctor} ` : "";
      return entries.length ? `${prefix}{ ${entries.join(", ")} }` : `${prefix}{}`;
    } catch {
      return "<throws>";
    } finally {
      seen.delete(v);
    }
  }

  let text: string;
  try {
    text = walk(value, 0);
  } catch {
    text = "<throws>";
  }
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/features/testbed/serialize-value.test.ts`
Expected: PASS, 16 tests

- [ ] **Step 5: Replace the two duplicates**

In `src/features/testbed/ui/test-results-panel.tsx`, delete the whole `formatValue` function and its `/** bigints have no JSON representation… */` comment, add `import { serializeValue } from "../serialize-value";`, and replace both call sites (`formatValue(row.failure.expected)` and `formatValue(row.failure.actual)`) with `serializeValue(...)`.

In `src/features/testbed/runner/run-request.ts`, delete the `formatArg` function, add `import { serializeValue } from "../serialize-value";`, and replace its call site with `serializeValue(arg, { quoteStrings: false })`.

- [ ] **Step 6: Verify nothing regressed**

Run: `bun test src/features/testbed/`
Expected: PASS. The console-capture tests in `run-request.test.ts` exercise the `quoteStrings: false` path — if a string is suddenly quoted there, the option was not threaded through.

- [ ] **Step 7: Commit**

```bash
git add src/features/testbed/serialize-value.ts src/features/testbed/serialize-value.test.ts \
        src/features/testbed/ui/test-results-panel.tsx src/features/testbed/runner/run-request.ts
git commit -m "feat(studio): one value serialiser for traces, console and diffs"
```

---

## Task 2: The trace sink

**Files:**
- Create: `src/features/testbed/runner/trace.ts`
- Create: `src/features/testbed/runner/trace.test.ts`

The sink is where the caps live. One subtlety drives its design: a line inside a hot loop must not exhaust the per-test budget, or the "last 100 values" would be iterations 19,901–20,000 rather than the true last hundred. So the per-test counter only increments when a value genuinely grows memory — i.e. when a line's ring buffer is not yet full. The per-test cap then guards against *many distinct lines*, which is its real purpose.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/trace.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createTraceSink } from "./trace";

const FILE = "/proj/tests/a.test.ts";

describe("createTraceSink", () => {
  it("returns the value it was given, so it can wrap an expression", () => {
    const sink = createTraceSink();
    expect(sink.value(FILE, 1, "x", 42n)).toBe(42n);
  });

  it("records a value under its file, line and name", () => {
    const sink = createTraceSink();
    sink.value(FILE, 7, "counter", 2n);
    const { trace } = sink.endTest();
    expect(trace[FILE][7]).toEqual({ values: ["2n"], count: 1, name: "counter" });
  });

  it("counts repeats and keeps them in order", () => {
    const sink = createTraceSink();
    for (const n of [1n, 2n, 3n]) sink.value(FILE, 7, "r", n);
    const { trace } = sink.endTest();
    expect(trace[FILE][7].values).toEqual(["1n", "2n", "3n"]);
    expect(trace[FILE][7].count).toBe(3);
  });

  it("keeps the LAST values per line once the ring buffer is full", () => {
    const sink = createTraceSink({ valuesPerLine: 3 });
    for (const n of [1n, 2n, 3n, 4n, 5n]) sink.value(FILE, 7, "r", n);
    const { trace } = sink.endTest();
    expect(trace[FILE][7].values).toEqual(["3n", "4n", "5n"]);
    expect(trace[FILE][7].count).toBe(5);
  });

  it("does not let one hot line exhaust the per-test budget", () => {
    // The budget is 2 entries, but a single line may loop far more than twice
    // and must still yield the true last value plus a truthful count.
    const sink = createTraceSink({ valuesPerLine: 2, entriesPerTest: 2 });
    for (let n = 1; n <= 50; n++) sink.value(FILE, 7, "r", BigInt(n));
    const { trace, truncated } = sink.endTest();
    expect(trace[FILE][7].values).toEqual(["49n", "50n"]);
    expect(trace[FILE][7].count).toBe(50);
    expect(truncated).toBe(false);
  });

  it("stops recording and flags truncation when many distinct lines are touched", () => {
    const sink = createTraceSink({ entriesPerTest: 2 });
    sink.value(FILE, 1, "a", 1n);
    sink.value(FILE, 2, "b", 2n);
    sink.value(FILE, 3, "c", 3n);
    const { trace, truncated } = sink.endTest();
    expect(truncated).toBe(true);
    expect(trace[FILE][3].values).toEqual([]);
    // The count stays honest even when the value was dropped.
    expect(trace[FILE][3].count).toBe(1);
  });

  it("marks an assertion line as ok", () => {
    const sink = createTraceSink();
    sink.ok(FILE, 12);
    expect(sink.endTest().trace[FILE][12].ok).toBe(true);
  });

  it("separates files", () => {
    const sink = createTraceSink();
    sink.value(FILE, 1, "a", 1n);
    sink.value("/proj/tests/helpers/ctx.ts", 4, "b", 2n);
    const { trace } = sink.endTest();
    expect(Object.keys(trace).sort()).toEqual(["/proj/tests/a.test.ts", "/proj/tests/helpers/ctx.ts"]);
  });

  it("resets between tests, so one test never shows another's values", () => {
    const sink = createTraceSink();
    sink.value(FILE, 1, "a", 1n);
    sink.endTest();
    sink.value(FILE, 2, "b", 2n);
    const { trace } = sink.endTest();
    expect(trace[FILE][1]).toBeUndefined();
    expect(trace[FILE][2].values).toEqual(["2n"]);
  });

  it("clears the truncated flag between tests", () => {
    const sink = createTraceSink({ entriesPerTest: 1 });
    sink.value(FILE, 1, "a", 1n);
    sink.value(FILE, 2, "b", 2n);
    expect(sink.endTest().truncated).toBe(true);
    expect(sink.endTest().truncated).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test and watch it fail**

Run: `bun test src/features/testbed/runner/trace.test.ts`
Expected: FAIL — `Cannot find module './trace'`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/runner/trace.ts`:

```ts
import { serializeValue } from "../serialize-value";

export interface LineTrace {
  /** Display strings, oldest first, capped to `valuesPerLine`. */
  values: string[];
  /** How many times the line produced a value, including any dropped. */
  count: number;
  /** Set when an assertion on this line completed without throwing. */
  ok?: boolean;
  /** The bound name, when the line bound one. */
  name?: string;
}

/** line → what happened on it. */
export type FileTrace = Record<number, LineTrace>;
/** file → lines. One of these is captured per test. */
export type TestTrace = Record<string, FileTrace>;

export interface TraceLimits {
  valuesPerLine: number;
  entriesPerTest: number;
}

export const DEFAULT_LIMITS: TraceLimits = { valuesPerLine: 100, entriesPerTest: 20_000 };

export interface TraceSink {
  /** Records a value and returns it unchanged, so it can wrap an expression. */
  value(file: string, line: number, name: string, value: unknown): unknown;
  /** Marks an assertion on this line as having completed. */
  ok(file: string, line: number): void;
  /** Returns the trace built since the last call, and starts a fresh one. */
  endTest(): { trace: TestTrace; truncated: boolean };
}

/**
 * Collects what instrumented code reports, within fixed budgets.
 *
 * Values are serialised on arrival rather than held as references — see
 * `serialize-value.ts` for why that is a correctness requirement, not a
 * memory optimisation.
 *
 * The per-test budget counts only values that grow memory. A line looping
 * 30,000 times fills its ring buffer once and then costs nothing more, so it
 * cannot starve other lines, and its buffer still holds the true last values.
 */
export function createTraceSink(limits: Partial<TraceLimits> = {}): TraceSink {
  const { valuesPerLine, entriesPerTest } = { ...DEFAULT_LIMITS, ...limits };

  let current: TestTrace = {};
  let entries = 0;
  let truncated = false;

  function lineOf(file: string, line: number): LineTrace {
    const forFile = (current[file] ??= {});
    return (forFile[line] ??= { values: [], count: 0 });
  }

  return {
    value(file, line, name, value) {
      const trace = lineOf(file, line);
      trace.name = name;
      trace.count++;

      if (trace.values.length >= valuesPerLine) {
        // Ring buffer is full: replacing costs no extra memory, so it does not
        // draw on the per-test budget.
        trace.values.shift();
        trace.values.push(serializeValue(value));
        return value;
      }

      if (entries >= entriesPerTest) {
        truncated = true;
        return value;
      }

      entries++;
      trace.values.push(serializeValue(value));
      return value;
    },

    ok(file, line) {
      lineOf(file, line).ok = true;
    },

    endTest() {
      const result = { trace: current, truncated };
      current = {};
      entries = 0;
      truncated = false;
      return result;
    },
  };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/features/testbed/runner/trace.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/trace.ts src/features/testbed/runner/trace.test.ts
git commit -m "feat(studio): collect per-test value traces within fixed budgets"
```

---

## Task 3: Instrumenting bindings

**Files:**
- Modify: `apps/studio/package.json` (add `acorn`, `magic-string`)
- Create: `src/features/testbed/instrument/instrument.ts`
- Create: `src/features/testbed/instrument/instrument.test.ts`

The rule that makes everything else simple: **the output has exactly as many lines as the input.** Every insert is a single-line snippet, so the existing TS→JS sourcemap stays valid for line lookups and Plan 3's failure-to-line feature keeps working untouched.

Edits are collected first and applied outermost-first, so nesting does not depend on the traversal order of any library.

- [ ] **Step 1: Add the dependencies**

Run: `bun add acorn magic-string`
Expected: both appear under `dependencies` in `apps/studio/package.json`

Note: `acorn-walk` is deliberately **not** added. The generic walker below is a dozen lines and removes a dependency whose traversal order we would otherwise have to reason about.

- [ ] **Step 2: Write the failing test**

Create `src/features/testbed/instrument/instrument.test.ts`:

```ts
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
```

- [ ] **Step 3: Run the test and watch it fail**

Run: `bun test src/features/testbed/instrument/instrument.test.ts`
Expected: FAIL — `Cannot find module './instrument'`

- [ ] **Step 4: Write the implementation**

Create `src/features/testbed/instrument/instrument.ts`:

```ts
import { parse } from "acorn";
import MagicString from "magic-string";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

/** A range to wrap, or (when start === end) a marker to insert. */
interface Edit {
  start: number;
  end: number;
  prefix: string;
  suffix: string;
}

/** Any AST node. acorn's own types are structural and awkward to narrow. */
type Node = Record<string, any>;

/**
 * Walks every node in the tree, in no particular order.
 *
 * Written out rather than pulling in `acorn-walk` because edits are collected
 * and sorted before being applied, so traversal order is irrelevant — and not
 * depending on a library's order is one less thing to be wrong about.
 */
function visit(node: unknown, fn: (node: Node) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) visit(child, fn);
    return;
  }
  const record = node as Node;
  if (typeof record.type === "string") fn(record);
  for (const key of Object.keys(record)) {
    if (key === "loc" || key === "start" || key === "end" || key === "range") continue;
    visit(record[key], fn);
  }
}

function safeTraceMap(raw: string): TraceMap | null {
  try {
    return new TraceMap(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Rewrites emitted JavaScript so every binding reports its value.
 *
 * Guarantees the output has exactly as many lines as the input: every insert is
 * a single-line snippet. That keeps the existing TS→JS sourcemap valid for line
 * lookups, so nothing downstream needs a composed map.
 *
 * Line numbers are resolved here, once, and baked into the emitted calls — the
 * runtime never maps anything.
 *
 * Returns the input unchanged if it cannot be parsed. Inline values are a
 * convenience layered on top of a working test run, and must never cost one.
 */
export function instrument(js: string, sourceMap?: string): string {
  let ast: Node;
  try {
    ast = parse(js, { ecmaVersion: "latest", sourceType: "script", locations: true }) as Node;
  } catch {
    return js;
  }

  const map = sourceMap ? safeTraceMap(sourceMap) : null;

  /** The line to report for a node: the original TypeScript line where possible. */
  function lineFor(node: Node): number {
    const generated = node.loc.start.line as number;
    if (!map) return generated;
    const original = originalPositionFor(map, {
      line: generated,
      column: node.loc.start.column as number,
    });
    return original.line ?? generated;
  }

  const edits: Edit[] = [];

  visit(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.init && node.id?.type === "Identifier") {
      edits.push({
        start: node.init.start,
        end: node.init.end,
        prefix: `__v(${lineFor(node)},${JSON.stringify(node.id.name)}, `,
        suffix: ")",
      });
      return;
    }

    if (node.type === "AssignmentExpression" && node.left?.type === "Identifier") {
      // The whole assignment is wrapped, not just the right-hand side, so a
      // compound operator reports the resulting value rather than the operand.
      edits.push({
        start: node.start,
        end: node.end,
        prefix: `__v(${lineFor(node)},${JSON.stringify(node.left.name)}, `,
        suffix: ")",
      });
    }
  });

  return applyEdits(js, edits);
}

/**
 * Applies edits outermost-first, so a wrap that contains another ends up outside
 * it. Sorting here means the result does not depend on the order nodes were
 * visited in, nor on magic-string's internal insertion rules beyond the
 * documented appendLeft/prependRight pairing.
 */
export function applyEdits(js: string, edits: Edit[]): string {
  if (edits.length === 0) return js;

  const ordered = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  const output = new MagicString(js);

  for (const edit of ordered) {
    if (edit.prefix) output.appendLeft(edit.start, edit.prefix);
    if (edit.suffix) output.prependRight(edit.end, edit.suffix);
  }

  return output.toString();
}
```

- [ ] **Step 5: Run the test and watch it pass**

Run: `bun test src/features/testbed/instrument/instrument.test.ts`
Expected: PASS, 15 tests

**If the `nests correctly` test fails** with the wraps inverted (`__v(1,"b", …)` outside `__v(1,"a", …)`), the `appendLeft`/`prependRight` pairing in `applyEdits` is the wrong way round for the sort order. Swap them — `prependRight(edit.start, edit.prefix)` and `appendLeft(edit.end, edit.suffix)` — and re-run. Exactly one of the two pairings is correct for outermost-first ordering; the test discriminates.

- [ ] **Step 6: Commit**

```bash
git add package.json bun.lock src/features/testbed/instrument/instrument.ts \
        src/features/testbed/instrument/instrument.test.ts
git commit -m "feat(studio): line-preserving instrumentation of variable bindings"
```

---

## Task 4: Instrumenting assertions

**Files:**
- Modify: `src/features/testbed/instrument/instrument.ts`
- Modify: `src/features/testbed/instrument/instrument.test.ts`

An assertion needs only a marker *after* the statement. If the assertion throws, the marker never runs, so the line is not marked as passing — and the failing side already arrives from Plan 3, which resolves the thrown `AssertionError` to its line. No try/catch, no arrow wrapper, no change to evaluation semantics.

- [ ] **Step 1: Write the failing test**

Append to `src/features/testbed/instrument/instrument.test.ts`, inside the existing `describe("instrument", …)` block:

```ts
  it("marks a completed assertion", () => {
    const out = expectLinePreserved(`expect(counter).toBe(2n);`);
    expect(out).toBe(`expect(counter).toBe(2n); __ok(1);`);
  });

  it("marks an assertion at the end of a long chain", () => {
    const out = expectLinePreserved(`expect(a).resolves.toBe(1);`);
    expect(out).toContain(`__ok(1);`);
  });

  it("uses the line the assertion starts on when it spans several", () => {
    const out = expectLinePreserved(`expect(tb.getMap(1n, 10n))\n  .toBe(1n);`);
    expect(out).toContain(`__ok(1);`);
    expect(out).not.toContain(`__ok(2);`);
  });

  it("does not mark a call that merely mentions expect deeper in", () => {
    const out = expectLinePreserved(`assertThat(expect(a));`);
    expect(out).not.toContain("__ok(");
  });

  it("does not mark an ordinary call", () => {
    const out = expectLinePreserved(`tb.runScenario(txs);`);
    expect(out).not.toContain("__ok(");
  });

  it("marks assertions inside a test body", () => {
    const src = `it("t", () => {\n  expect(1n).toBe(1n);\n});`;
    const out = expectLinePreserved(src);
    expect(out).toContain(`__ok(2);`);
  });

  it("marks an assertion and wraps a binding on the same line independently", () => {
    const out = expectLinePreserved(`const a = 1; expect(a).toBe(1);`);
    expect(out).toBe(`const a = __v(1,"a", 1); expect(a).toBe(1); __ok(1);`);
  });
```

- [ ] **Step 2: Run and watch the new tests fail**

Run: `bun test src/features/testbed/instrument/instrument.test.ts`
Expected: FAIL on the assertion tests — no `__ok(` is emitted yet

- [ ] **Step 3: Implement the marker**

In `src/features/testbed/instrument/instrument.ts`, add this helper above `instrument`:

```ts
/**
 * The identifier a call chain ultimately starts from: for
 * `expect(a).resolves.toBe(1)` that is `expect`.
 */
function chainRoot(node: Node): Node | null {
  let current: Node | null = node;
  while (current) {
    if (current.type === "CallExpression") current = current.callee as Node;
    else if (current.type === "MemberExpression") current = current.object as Node;
    else return current;
  }
  return null;
}
```

and add this third clause inside the `visit(ast, (node) => { … })` callback, after the `AssignmentExpression` clause:

```ts
    if (node.type === "ExpressionStatement" && node.expression?.type === "CallExpression") {
      const root = chainRoot(node.expression as Node);
      if (root?.type === "Identifier" && root.name === "expect") {
        // A marker after the statement: if the assertion throws, this never runs.
        edits.push({
          start: node.end,
          end: node.end,
          prefix: "",
          suffix: ` __ok(${lineFor(node)});`,
        });
      }
    }
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/features/testbed/instrument/instrument.test.ts`
Expected: PASS, 22 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/instrument/instrument.ts src/features/testbed/instrument/instrument.test.ts
git commit -m "feat(studio): mark completed assertions during instrumentation"
```

---

## Task 5: Handing `__v` and `__ok` to evaluated modules

**Files:**
- Modify: `src/features/testbed/runner/module-registry.ts`
- Modify: `src/features/testbed/source-position.ts`
- Modify: `src/features/testbed/runner/module-registry.test.ts`
- Modify: `src/features/testbed/source-position.test.ts`

Each module gets its own `__v`/`__ok` bound to its path, exactly as it already gets its own `require`. That keeps the emitted calls short — the instrumenter never has to repeat the file path.

**This task also fixes a latent coupling.** `detectWrapperOffset()` builds its probe with `new Function(body)` — zero parameters — while the registry calls `new Function("require", "exports", "module", body)`. They agree today because parameters land on line 1 either way, but the probe is supposed to measure the real call site and currently does not mirror it. Adding two more parameters is the moment to fix that.

- [ ] **Step 1: Write the failing tests**

Append to `src/features/testbed/runner/module-registry.test.ts`:

```ts
describe("value tracing", () => {
  it("gives each module a __v bound to its own path", () => {
    const seen: Array<[string, number, string, unknown]> = [];
    const registry = createRegistry({
      modules: { "/p/a.ts": { js: `module.exports.x = __v(3,"x", 7);` } },
      rawFiles: {},
      virtuals: {},
      trace: {
        value: (file, line, name, value) => {
          seen.push([file, line, name, value]);
          return value;
        },
        ok: () => {},
        endTest: () => ({ trace: {}, truncated: false }),
      },
    });

    expect((registry.require("/p/a.ts") as { x: number }).x).toBe(7);
    expect(seen).toEqual([["/p/a.ts", 3, "x", 7]]);
  });

  it("gives each module an __ok bound to its own path", () => {
    const seen: Array<[string, number]> = [];
    const registry = createRegistry({
      modules: { "/p/a.ts": { js: `__ok(9);` } },
      rawFiles: {},
      virtuals: {},
      trace: {
        value: (_f, _l, _n, v) => v,
        ok: (file, line) => void seen.push([file, line]),
        endTest: () => ({ trace: {}, truncated: false }),
      },
    });

    registry.require("/p/a.ts");
    expect(seen).toEqual([["/p/a.ts", 9]]);
  });

  it("still evaluates instrumented code when no sink is supplied", () => {
    const registry = createRegistry({
      modules: { "/p/a.ts": { js: `module.exports.x = __v(1,"x", 7); __ok(1);` } },
      rawFiles: {},
      virtuals: {},
    });

    expect((registry.require("/p/a.ts") as { x: number }).x).toBe(7);
  });
});
```

Append to `src/features/testbed/source-position.test.ts`:

```ts
describe("detectWrapperOffset with the registry's real signature", () => {
  it("measures the same offset the registry's own wrapper produces", () => {
    // The registry compiles modules with five named parameters. The probe must
    // use the same signature, or it measures a wrapper nobody actually runs.
    const real = new Function(
      "require",
      "exports",
      "module",
      "__v",
      "__ok",
      "return new Error().stack;\n//# sourceURL=__real_probe__",
    );
    const frame = firstFrameIn(String(real()), "__real_probe__");
    expect(frame).not.toBeNull();
    expect(frame!.line - 1).toBe(detectWrapperOffset());
  });
});
```

- [ ] **Step 2: Run and watch them fail**

Run: `bun test src/features/testbed/runner/module-registry.test.ts src/features/testbed/source-position.test.ts`
Expected: FAIL — `__v is not defined`, and a type error on the unknown `trace` option

- [ ] **Step 3: Extend the registry**

In `src/features/testbed/runner/module-registry.ts`, add the import:

```ts
import type { TraceSink } from "./trace";
```

add a field to `RegistryOptions`:

```ts
  /** Receives values from instrumented modules. Omit to evaluate without tracing. */
  trace?: TraceSink;
```

and replace the two lines inside `requirePath` that build and call `fn`:

```ts
    const fn = new Function(
      "require",
      "exports",
      "module",
      "__v",
      "__ok",
      compiled.js + "\n//# sourceURL=" + path,
    );

    const sink = opts.trace;
    const recordValue = sink
      ? (line: number, name: string, value: unknown) => sink.value(path, line, name, value)
      : (_line: number, _name: string, value: unknown) => value;
    const recordOk = sink ? (line: number) => sink.ok(path, line) : () => {};

    fn((spec: string) => requireFrom(path, spec), module.exports, module, recordValue, recordOk);
```

- [ ] **Step 4: Make the probe mirror the call site**

In `src/features/testbed/source-position.ts`, replace the body of `detectWrapperOffset`:

```ts
export function detectWrapperOffset(): number {
  // Mirrors the parameter list in module-registry.ts. The probe exists to
  // measure the wrapper the registry actually produces, so its signature has to
  // match — otherwise it measures a function nobody runs.
  const probe = new Function(
    "require",
    "exports",
    "module",
    "__v",
    "__ok",
    "return new Error().stack;\n//# sourceURL=__wrapper_probe__",
  );
  const frame = firstFrameIn(String(probe()), "__wrapper_probe__");
  // The probe's `return` is on body line 1, so the offset is whatever was added.
  return frame ? frame.line - 1 : 2;
}
```

- [ ] **Step 5: Run the tests and watch them pass**

Run: `bun test src/features/testbed/`
Expected: PASS — all existing tests plus the three new registry tests and the new probe test

- [ ] **Step 6: Commit**

```bash
git add src/features/testbed/runner/module-registry.ts src/features/testbed/runner/module-registry.test.ts \
        src/features/testbed/source-position.ts src/features/testbed/source-position.test.ts
git commit -m "feat(studio): bind __v and __ok per module, and mirror the wrapper probe"
```

---

## Task 6: Producing traces during a run

**Files:**
- Modify: `src/features/testbed/runner/types.ts`
- Modify: `src/features/testbed/runner/run-request.ts`
- Modify: `src/features/testbed/runner/run-request.test.ts`

The sink has no idea when a test begins or ends, and `runSuite` owns that loop. Rather than thread a callback through it, `run-request` intercepts the events it already forwards: when a `test:end` goes past, the trace built since the previous one is closed and attached.

Values captured before the first `test:start` — module top level, and any `beforeAll` — land in the first test's trace. That is deliberate: they did run for it.

- [ ] **Step 1: Write the failing test**

Append to `src/features/testbed/runner/run-request.test.ts`:

```ts
describe("value traces", () => {
  it("instruments the module, so a plain binding is captured end to end", async () => {
    const events: TestEvent[] = [];
    await runRequest(
      {
        modules: {
          "/p/a.test.ts": {
            js: `const v = require("vitest");\nv.it("t", () => { const counter = 2n; v.expect(counter).toBe(2n); });`,
          },
        },
        rawFiles: {},
        entryPaths: ["/p/a.test.ts"],
      },
      (event) => events.push(event),
    );

    const end = events.find((e) => e.type === "test:end") as Extract<
      TestEvent,
      { type: "test:end" }
    >;
    expect(end.status).toBe("passed");
    // The source is uninstrumented here; run-request instruments it, which is
    // exactly what this asserts — the value arrives without the test doing
    // anything special.
    expect(end.trace!["/p/a.test.ts"][2]).toEqual({ values: ["2n"], count: 1, name: "counter" });
  });

  it("does not leak one test's values into the next", async () => {
    const events: TestEvent[] = [];
    await runRequest(
      {
        modules: {
          "/p/a.test.ts": {
            js: `const v = require("vitest");
                 v.it("one", () => { __v(1,"a", 1n); });
                 v.it("two", () => { __v(2,"b", 2n); });`,
          },
        },
        rawFiles: {},
        entryPaths: ["/p/a.test.ts"],
      },
      (event) => events.push(event),
    );

    const ends = events.filter((e) => e.type === "test:end") as Array<
      Extract<TestEvent, { type: "test:end" }>
    >;
    expect(ends).toHaveLength(2);
    expect(ends[0].trace!["/p/a.test.ts"][1].values).toEqual(["1n"]);
    expect(ends[0].trace!["/p/a.test.ts"][2]).toBeUndefined();
    expect(ends[1].trace!["/p/a.test.ts"][2].values).toEqual(["2n"]);
    expect(ends[1].trace!["/p/a.test.ts"][1]).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/runner/run-request.test.ts`
Expected: FAIL — `test:end` has no `trace` property

- [ ] **Step 3: Extend the event**

In `src/features/testbed/runner/types.ts`, add the import:

```ts
import type { TestTrace } from "./trace";
```

and replace the `test:end` member of the `TestEvent` union:

```ts
  | {
      type: "test:end";
      id: string;
      status: TestStatus;
      durationMs: number;
      failure?: TestFailure;
      /** Values captured while this test ran, by file and line. */
      trace?: TestTrace;
      /** True when the trace hit its budget and stopped recording. */
      traceTruncated?: boolean;
    }
```

- [ ] **Step 4: Wire the sink into the run**

In `src/features/testbed/runner/run-request.ts`, add the imports:

```ts
import { createTraceSink } from "./trace";
import { instrument } from "../instrument/instrument";
```

Immediately before `const registry = createRegistry({ … })`, create the sink and instrument the modules:

```ts
    const sink = createTraceSink();

    // Instrumentation targets only `request.modules`, which `snapshotProject`
    // fills from the user's project folder — `signum-smartc-testbed` arrives as
    // a virtual, so node_modules is out of reach by construction.
    const instrumented: typeof request.modules = {};
    for (const [path, compiled] of Object.entries(request.modules)) {
      instrumented[path] = { ...compiled, js: instrument(compiled.js, compiled.sourceMap) };
    }
```

Change the registry call to use the instrumented modules and the sink:

```ts
    const registry = createRegistry({
      modules: instrumented,
      rawFiles: request.rawFiles,
      trace: sink,
      virtuals: {
        vitest: api,
        "signum-smartc-testbed": { __esModule: true, ...testbedPkg, SimulatorTestbed: Recorded },
      },
    });
```

Then wrap the emit callback passed to `runSuite` so a closing `test:end` carries its trace. Find the existing `emitTracked` and add, just before the `await runSuite(...)` call:

```ts
    /** Closes the current trace as each test ends, and starts the next. */
    const emitWithTrace = (event: TestEvent) => {
      if (event.type === "test:end") {
        const { trace, truncated } = sink.endTest();
        emitTracked({ ...event, trace, traceTruncated: truncated });
        return;
      }
      emitTracked(event);
    };
```

and pass `emitWithTrace` to `runSuite` in place of `emitTracked`.

**Important:** the line resolution added in Plan 3 reads `request.modules` to build its sourcemaps. Leave that reading the *original* `request.modules`, not `instrumented` — the maps are identical (instrumentation preserves lines and copies `sourceMap` through), but the original is the honest source.

- [ ] **Step 5: Run the tests and watch them pass**

Run: `bun test src/features/testbed/`
Expected: PASS, including the integration test that runs a real contract. That test is the one that proves instrumented contract code still executes correctly — if it fails, the rewrite is changing behaviour, which is a real defect and must not be worked around by weakening the test.

- [ ] **Step 6: Verify the build**

Run: `bun run build`
Expected: succeeds. This is the first task that pulls `acorn` and `magic-string` into the worker bundle, so a bundling failure surfaces here.

- [ ] **Step 7: Commit**

```bash
git add src/features/testbed/runner/types.ts src/features/testbed/runner/run-request.ts \
        src/features/testbed/runner/run-request.test.ts
git commit -m "feat(studio): capture a value trace per test during a run"
```

---

## Task 7: Turning a trace into an annotation

**Files:**
- Create: `src/features/testbed/annotation.ts`
- Create: `src/features/testbed/annotation.test.ts`

The pure function between a `LineTrace` and what the editor draws. Kept separate from the Monaco hook so the formatting rules — which have all the edge cases — are testable without a browser.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/annotation.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { formatAnnotation } from "./annotation";

describe("formatAnnotation", () => {
  it("shows a binding as name = value", () => {
    expect(formatAnnotation({ values: ["2n"], count: 1, name: "counter" })).toEqual({
      text: "counter = 2n",
    });
  });

  it("shows the last value and a count when a line repeated", () => {
    const result = formatAnnotation({ values: ["1n", "2n", "3n"], count: 3, name: "r" });
    expect(result.text).toBe("r = 3n  ×3");
  });

  it("lists every value in the hover when a line repeated", () => {
    const result = formatAnnotation({ values: ["1n", "2n", "3n"], count: 3, name: "r" });
    expect(result.hover).toBe("1: 1n\n\n2: 2n\n\n3: 3n");
  });

  it("has no hover when a line ran once", () => {
    expect(formatAnnotation({ values: ["2n"], count: 1, name: "c" }).hover).toBeUndefined();
  });

  it("says so when the values shown are only the tail", () => {
    const result = formatAnnotation({ values: ["299n", "300n"], count: 300, name: "r" });
    expect(result.text).toBe("r = 300n  ×300");
    expect(result.hover).toContain("showing last 2 of 300");
  });

  it("numbers a truncated hover from the real iteration, not from one", () => {
    const result = formatAnnotation({ values: ["299n", "300n"], count: 300, name: "r" });
    expect(result.hover).toContain("299: 299n");
    expect(result.hover).toContain("300: 300n");
  });

  it("shows a tick for a completed assertion", () => {
    expect(formatAnnotation({ values: [], count: 0, ok: true })).toEqual({ text: "✓" });
  });

  it("prefers the binding over the assertion marker when a line has both", () => {
    expect(formatAnnotation({ values: ["1n"], count: 1, name: "a", ok: true }).text).toBe("a = 1n");
  });

  it("returns null for a line with nothing to say", () => {
    expect(formatAnnotation({ values: [], count: 0 })).toBeNull();
  });

  it("returns null when the value was dropped by the budget", () => {
    // count is honest, but there is no value to show.
    expect(formatAnnotation({ values: [], count: 4, name: "r" })).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/annotation.test.ts`
Expected: FAIL — `Cannot find module './annotation'`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/annotation.ts`:

```ts
import type { LineTrace } from "./runner/trace";

export interface Annotation {
  /** Ghost text drawn at the end of the line. */
  text: string;
  /** Markdown shown on hover. Absent when the text says everything. */
  hover?: string;
}

/**
 * Renders one line's trace as the text the editor draws beside it.
 *
 * Returns null when there is nothing worth drawing, so callers can filter
 * rather than render an empty decoration.
 */
export function formatAnnotation(trace: LineTrace): Annotation | null {
  const { values, count, name, ok } = trace;

  if (values.length === 0) {
    // A bare assertion marker is worth a tick; a binding whose value the budget
    // dropped is not worth an empty annotation.
    return ok ? { text: "✓" } : null;
  }

  const last = values[values.length - 1];
  const label = name ? `${name} = ${last}` : last;

  if (count <= 1) return { text: label };

  const dropped = count - values.length;
  const lines = values.map((value, index) => `${dropped + index + 1}: ${value}`);
  const header = dropped > 0 ? `showing last ${values.length} of ${count}\n\n` : "";

  return { text: `${label}  ×${count}`, hover: header + lines.join("\n\n") };
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/features/testbed/annotation.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/annotation.ts src/features/testbed/annotation.test.ts
git commit -m "feat(studio): format a line trace into editor ghost text"
```

---

## Task 8: Holding traces above the editor

**Files:**
- Create: `src/features/testbed/test-trace-store.ts`
- Create: `src/features/testbed/test-trace-store.test.ts`

Traces cannot live in `TestFileEditor`. You run a test file, then open `tests/helpers/context.ts` to see what that test saw going through the helper — and by then the component has unmounted and remounted for a different file. Since a trace is keyed by file across *every* file the run touched, the helper's values are already captured; they just need somewhere to live that outlasts one editor.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/test-trace-store.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createStore } from "jotai";
import {
  tracesAtom,
  activeTestIdAtom,
  activeTraceAtom,
  fileTraceAtom,
  resetTracesAtom,
} from "./test-trace-store";

const TEST_FILE = "/p/a.test.ts";
const HELPER = "/p/helpers/ctx.ts";

const traces = {
  "a#0": { [TEST_FILE]: { 3: { values: ["1n"], count: 1, name: "x" } } },
  "a#1": {
    [TEST_FILE]: { 9: { values: ["2n"], count: 1, name: "y" } },
    [HELPER]: { 4: { values: ["7n"], count: 1, name: "inner" } },
  },
};

describe("test trace store", () => {
  it("has no active trace before a test is selected", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    expect(store.get(activeTraceAtom)).toBeUndefined();
  });

  it("exposes the active test's trace", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    store.set(activeTestIdAtom, "a#1");
    expect(store.get(activeTraceAtom)).toEqual(traces["a#1"]);
  });

  it("returns the active test's lines for a given file", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    store.set(activeTestIdAtom, "a#1");
    expect(store.get(fileTraceAtom)(HELPER)).toEqual({ 4: { values: ["7n"], count: 1, name: "inner" } });
  });

  it("gives a helper file the active test's values, not another test's", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    store.set(activeTestIdAtom, "a#0");
    // "a#0" never entered the helper, so there is nothing to show there.
    expect(store.get(fileTraceAtom)(HELPER)).toBeUndefined();
  });

  it("returns undefined for a file the active test never touched", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    store.set(activeTestIdAtom, "a#1");
    expect(store.get(fileTraceAtom)("/p/unrelated.ts")).toBeUndefined();
  });

  it("clears traces and the selection when a new run starts", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    store.set(activeTestIdAtom, "a#1");
    store.set(resetTracesAtom);
    expect(store.get(tracesAtom)).toEqual({});
    expect(store.get(activeTestIdAtom)).toBeNull();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/test-trace-store.test.ts`
Expected: FAIL — `Cannot find module './test-trace-store'`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/test-trace-store.ts`:

```ts
import { atom } from "jotai";
import type { FileTrace, TestTrace } from "./runner/trace";

/** Every test's trace from the most recent run, keyed by test id. */
export const tracesAtom = atom<Record<string, TestTrace>>({});

/**
 * The test whose values are currently displayed.
 *
 * Deliberately survives navigating to another file: a helper contains no `it()`
 * of its own, so without a persistent selection there would be nothing to show
 * there — which is precisely the case inline values are most useful for.
 */
export const activeTestIdAtom = atom<string | null>(null);

export const activeTraceAtom = atom<TestTrace | undefined>((get) => {
  const id = get(activeTestIdAtom);
  return id ? get(tracesAtom)[id] : undefined;
});

/** The active test's lines for one file, or undefined if it never ran there. */
export const fileTraceAtom = atom((get) => {
  const trace = get(activeTraceAtom);
  return (file: string): FileTrace | undefined => trace?.[file];
});

/** Clears everything. Called when a run starts, so stale values never linger. */
export const resetTracesAtom = atom(null, (_get, set) => {
  set(tracesAtom, {});
  set(activeTestIdAtom, null);
});
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/features/testbed/test-trace-store.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/test-trace-store.ts src/features/testbed/test-trace-store.test.ts
git commit -m "feat(studio): hold value traces above the editor, keyed by test"
```

---

## Task 9: Filling the store from a run

**Files:**
- Modify: `src/features/testbed/test-run-model.ts`
- Modify: `src/features/testbed/test-run-model.test.ts`
- Modify: `src/features/testbed/use-test-run.ts`

The reducer already folds `test:end` into a row. It gains the trace, and the hook copies traces into the store as they arrive, selecting a sensible default test so values appear without anyone clicking anything.

- [ ] **Step 1: Write the failing test**

Append to `src/features/testbed/test-run-model.test.ts`, following the style of the existing `test:end` tests:

```ts
describe("traces", () => {
  it("carries a test's trace onto its row", () => {
    const trace = { "/p/a.test.ts": { 3: { values: ["2n"], count: 1, name: "x" } } };
    let state = initialRunState();
    state = reduceEvent(state, {
      type: "test:start",
      id: "a#0",
      name: "t",
      path: ["t"],
      file: "/p/a.test.ts",
    });
    state = reduceEvent(state, { type: "test:end", id: "a#0", status: "passed", durationMs: 1, trace });

    expect(state.rows[0].trace).toEqual(trace);
  });

  it("records that a trace was truncated", () => {
    let state = initialRunState();
    state = reduceEvent(state, {
      type: "test:start",
      id: "a#0",
      name: "t",
      path: ["t"],
      file: "/p/a.test.ts",
    });
    state = reduceEvent(state, {
      type: "test:end",
      id: "a#0",
      status: "passed",
      durationMs: 1,
      trace: {},
      traceTruncated: true,
    });

    expect(state.rows[0].traceTruncated).toBe(true);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/test-run-model.test.ts`
Expected: FAIL — `trace` is not a property of `TestRow`

- [ ] **Step 3: Extend the row**

In `src/features/testbed/test-run-model.ts`, add the import:

```ts
import type { TestTrace } from "./runner/trace";
```

add two fields to the `TestRow` interface:

```ts
  /** Values captured while this test ran. */
  trace?: TestTrace;
  /** True when capture hit its budget and stopped. */
  traceTruncated?: boolean;
```

and in the `test:end` case of `reduceEvent`, carry them onto the row alongside the existing `status`, `durationMs` and `failure` fields:

```ts
        trace: event.trace,
        traceTruncated: event.traceTruncated,
```

- [ ] **Step 4: Run the reducer test and watch it pass**

Run: `bun test src/features/testbed/test-run-model.test.ts`
Expected: PASS

- [ ] **Step 5: Fill the store from the hook**

In `src/features/testbed/use-test-run.ts`, add the imports:

```ts
import { useSetAtom } from "jotai";
import { tracesAtom, activeTestIdAtom, resetTracesAtom } from "./test-trace-store";
```

Inside the hook body, before the `run` callback:

```ts
  const setTraces = useSetAtom(tracesAtom);
  const setActiveTestId = useSetAtom(activeTestIdAtom);
  const resetTraces = useSetAtom(resetTracesAtom);
```

Call `resetTraces()` where the run state is initialised at the start of `run`, so a new run never shows the previous one's values.

In the event-handling callback — the same place the reducer is folded — add, after the fold:

```ts
      if (event.type === "test:end" && event.trace) {
        const { id, trace } = event;
        setTraces((current) => ({ ...current, [id]: trace }));
        // Land on the first test that produced values, so something is shown
        // without anyone clicking. A failure takes precedence, but that decision
        // needs the whole run, so it is made at run:end below.
        setActiveTestId((current) => current ?? id);
      }
```

and, in the same callback, after the fold for the run's final event:

```ts
      if (event.type === "run:end") {
        // Now that every result is known, prefer the first failure — that is
        // almost always the test the user is here to look at.
        const firstFailure = stateRef.current.rows.find(
          (row) => row.status === "failed" || row.status === "timedout",
        );
        if (firstFailure) setActiveTestId(firstFailure.id);
      }
```

`stateRef` is the ref the hook already folds run state against — reuse it rather than adding another. Read the surrounding code to get its exact name.

Add the three setters to the `run` callback's dependency array.

- [ ] **Step 6: Verify**

Run: `bun test src/features/testbed/`
Expected: PASS

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "use-test-run|test-run-model" || echo "no errors in changed files"`
Expected: `no errors in changed files`

(`tsc` reports pre-existing errors in unrelated files — notably `src/features/simulator/ui/asm-view.tsx` — caused by two `monaco-editor` versions resolving in the dependency tree. Those are not yours. Filter on actual file paths; a loose grep on `types` also false-positives on `bun-types` package conflicts.)

- [ ] **Step 7: Commit**

```bash
git add src/features/testbed/test-run-model.ts src/features/testbed/test-run-model.test.ts \
        src/features/testbed/use-test-run.ts
git commit -m "feat(studio): route per-test traces into the trace store"
```

---

## Task 10: Drawing the values

**Files:**
- Create: `src/features/testbed/ui/use-value-decorations.ts`
- Modify: `src/features/testbed/ui/test-file-editor.tsx`
- Modify: `src/index.css`

Follow the existing pattern in `src/features/simulator/ui/use-debug-decorations.ts` — read it first. It creates a collection on every dependency change and clears it on cleanup; `use-test-decorations.ts` in this same folder does the same. Match that, do not invent a third convention.

This hook holds no decisions: everything with an edge case lives in `annotation.ts`, following the precedent set by `transpile.ts`, which cannot be tested outside a browser and therefore holds no logic.

- [ ] **Step 1: Write the hook**

Create `src/features/testbed/ui/use-value-decorations.ts`:

```ts
import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import { formatAnnotation } from "../annotation";
import type { FileTrace } from "../runner/trace";

/**
 * Draws each line's captured value as ghost text at the end of that line.
 *
 * Lines with nothing to say are skipped rather than annotated blank — an empty
 * marker beside a line reads as "this ran and produced nothing", which is a
 * different claim from "this was not recorded".
 */
export function useValueDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  trace: FileTrace | undefined,
) {
  useEffect(() => {
    if (!editor || !monaco || !trace) return;

    const model = editor.getModel();
    if (!model) return;

    const lineCount = model.getLineCount();
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];

    for (const [rawLine, lineTrace] of Object.entries(trace)) {
      const line = Number(rawLine);
      // A trace outlives edits, so a line it names may no longer exist.
      if (!Number.isInteger(line) || line < 1 || line > lineCount) continue;

      const annotation = formatAnnotation(lineTrace);
      if (!annotation) continue;

      const column = model.getLineMaxColumn(line);
      decorations.push({
        range: new monaco.Range(line, column, line, column),
        options: {
          after: { content: `    ${annotation.text}`, inlineClassName: "test-inline-value" },
          hoverMessage: annotation.hover ? { value: annotation.hover } : undefined,
          showIfCollapsed: true,
        },
      });
    }

    const collection = editor.createDecorationsCollection(decorations);
    return () => collection.clear();
  }, [editor, monaco, trace]);
}
```

- [ ] **Step 2: Add the style**

Append to `src/index.css`:

```css
/* Values captured during a test run, drawn after the line that produced them. */
.test-inline-value {
  color: rgb(113 113 122);
  font-style: italic;
  opacity: 0.9;
}
```

- [ ] **Step 3: Wire it into the editor**

In `src/features/testbed/ui/test-file-editor.tsx`, add the imports:

```tsx
import { useAtomValue, useSetAtom } from "jotai";
import { fileTraceAtom, activeTestIdAtom } from "../test-trace-store";
import { useValueDecorations } from "./use-value-decorations";
```

Add, next to the existing `useTestDecorations(...)` call:

```tsx
  const traceForFile = useAtomValue(fileTraceAtom);
  useValueDecorations(editorRef.current, monacoRef.current, traceForFile(file.metadata.path));
```

- [ ] **Step 4: Let the results panel select the active test**

In `src/features/testbed/ui/test-results-panel.tsx`, widen both signatures. Replace the `TestRowView` signature and its outer `div`:

```tsx
function TestRowView({
  row,
  onRevealLine,
  onSelectTest,
  isActive,
}: {
  row: TestRow;
  onRevealLine?: (line: number) => void;
  onSelectTest?: (id: string) => void;
  isActive?: boolean;
}) {
  return (
    <div
      className={`border-b border-border/50 px-3 py-2 text-sm${isActive ? " bg-muted/40" : ""}`}
    >
```

Replace the row-header button's `onClick` so selecting and revealing happen together:

```tsx
            onClick={() => {
              onSelectTest?.(row.id);
              onRevealLine(row.line!);
            }}
```

A row with no resolved line currently renders a plain `<span>` and so cannot be selected. Make that branch selectable too, since a test without a line still has values worth showing:

```tsx
        ) : (
          <button
            type="button"
            onClick={() => onSelectTest?.(row.id)}
            className="truncate text-left hover:underline"
          >
            {row.path.length ? row.path.join(" › ") : row.name}
          </button>
        )}
```

Widen the panel's props:

```tsx
export function TestResultsPanel({
  state,
  onRevealLine,
  onDebug,
  onSelectTest,
  activeTestId,
}: {
  state: RunState;
  onRevealLine?: (line: number) => void;
  onDebug?: () => void;
  onSelectTest?: (id: string) => void;
  activeTestId?: string | null;
}) {
```

and pass them down at the call site:

```tsx
        {state.rows.map((row) => (
          <TestRowView
            key={row.id}
            row={row}
            onRevealLine={onRevealLine}
            onSelectTest={onSelectTest}
            isActive={row.id === activeTestId}
          />
        ))}
```

In `test-file-editor.tsx`, add next to the other atom hooks:

```tsx
  const setActiveTestId = useSetAtom(activeTestIdAtom);
  const activeTestId = useAtomValue(activeTestIdAtom);
```

and add two props to the existing `<TestResultsPanel …/>` element:

```tsx
            activeTestId={activeTestId}
            onSelectTest={setActiveTestId}
```

- [ ] **Step 5: Show which test the values came from**

Values must never be mistaken for a different execution, so the editor states which test produced them.

In `test-file-editor.tsx`, add beside the other derived values:

```tsx
  const activeRow = state.rows.find((row) => row.id === activeTestId);
```

and replace the whole left `ResizablePanel` with this, which adds the header and gives the editor a definite height inside a flex column:

```tsx
        <ResizablePanel defaultSize={60} minSize={30}>
          <div className="flex h-full flex-col">
            {activeRow && (
              <div className="shrink-0 border-b border-border px-3 py-1 text-xs text-muted-foreground">
                showing values from:{" "}
                {activeRow.path.length ? activeRow.path.join(" › ") : activeRow.name}
                {activeRow.traceTruncated && " — trace truncated, some values were not recorded"}
              </div>
            )}
            <div className="min-h-0 flex-1">
              <Editor
                height="100%"
                language="typescript"
                path={"file://" + file.metadata.path}
                theme={theme === "dark" ? "vs-dark" : "light"}
                value={code}
                onChange={(value) => setCode(value ?? "")}
                onMount={onMount}
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  glyphMargin: true,
                }}
              />
            </div>
          </div>
        </ResizablePanel>
```

This mirrors how the right panel was structured for the debug-run checkbox: a `shrink-0` header above a `min-h-0 flex-1` body.

- [ ] **Step 6: Verify**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "use-value-decorations|test-file-editor|test-results-panel" || echo "no errors in changed files"`
Expected: `no errors in changed files`

Run: `bun test src/features/testbed/`
Expected: PASS

Run: `bun run build`
Expected: succeeds

- [ ] **Step 7: Commit**

```bash
git add src/features/testbed/ui/use-value-decorations.ts src/features/testbed/ui/test-file-editor.tsx \
        src/features/testbed/ui/test-results-panel.tsx src/index.css
git commit -m "feat(studio): draw captured values beside the lines that produced them"
```

---

## Task 11: Keeping the DevTools fallback usable

**Files:**
- Modify: `src/features/testbed/runner/module-registry.ts`
- Modify: `src/features/testbed/runner/module-registry.test.ts`
- Create: `src/features/testbed/ui/devtools-help.tsx`
- Modify: `src/features/testbed/ui/test-file-editor.tsx`

The registry appends `//# sourceURL=` but no `sourceMappingURL`, so DevTools shows raw emitted JavaScript. After Task 6 that view is full of `__v(...)` calls — the fallback degrades exactly when someone reaches for it. An inline sourcemap makes DevTools show the original TypeScript instead, which both fixes the regression and makes breakpoints land on real source lines.

This does **not** disturb Plan 3's line resolution: V8 does not apply sourcemaps to `Error.stack`, only DevTools does, and only for display. Stack frames still report generated positions.

- [ ] **Step 1: Write the failing test**

Append to `src/features/testbed/runner/module-registry.test.ts`:

```ts
describe("buildModuleSource", () => {
  const MAP = JSON.stringify({ version: 3, sources: ["a.ts"], names: [], mappings: "" });

  it("names the module so it appears under its real path in DevTools", () => {
    expect(buildModuleSource(`module.exports.x = 1;`, "/p/a.ts", MAP)).toContain(
      "//# sourceURL=/p/a.ts",
    );
  });

  it("appends an inline sourceMappingURL when a map is available", () => {
    expect(buildModuleSource(`module.exports.x = 1;`, "/p/a.ts", MAP)).toContain(
      "//# sourceMappingURL=data:application/json;charset=utf-8;base64,",
    );
  });

  it("keeps the original code first", () => {
    expect(buildModuleSource(`module.exports.x = 1;`, "/p/a.ts", MAP).startsWith(
      "module.exports.x = 1;",
    )).toBe(true);
  });

  it("omits the sourceMappingURL when there is no map", () => {
    const built = buildModuleSource(`module.exports.x = 1;`, "/p/a.ts", undefined);
    expect(built).toContain("//# sourceURL=/p/a.ts");
    expect(built).not.toContain("sourceMappingURL");
  });

  it("round-trips non-ASCII through base64", () => {
    // `btoa` alone throws on any code point above 0xFF, so a map naming a file
    // with an umlaut is the case that catches a naive implementation.
    const map = JSON.stringify({ version: 3, sources: ["ü.ts"], names: [], mappings: "" });
    const encoded = buildModuleSource(`x`, "/p/a.ts", map).split("base64,")[1].trim();
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
    );
    expect(JSON.parse(decoded)).toEqual(JSON.parse(map));
  });
});
```

Add `buildModuleSource` to the existing import from `./module-registry`.

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/runner/module-registry.test.ts`
Expected: FAIL — `buildModuleSource` is not exported

- [ ] **Step 3: Implement it**

In `src/features/testbed/runner/module-registry.ts`, add above `createRegistry`:

```ts
/** UTF-8 safe base64. `btoa` alone throws on any code point above 0xFF. */
function toBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/**
 * The text handed to `new Function`, with the trailing comments that make an
 * evaluated module navigable in DevTools.
 *
 * `sourceURL` gives the module its real path in the Sources tree; the inline
 * `sourceMappingURL` makes DevTools display the original TypeScript rather than
 * the instrumented JavaScript, so breakpoints land on lines the user wrote.
 *
 * Exported for testing: building the string is the part with rules in it.
 */
export function buildModuleSource(js: string, path: string, sourceMap: string | undefined): string {
  const source = js + "\n//# sourceURL=" + path;
  if (!sourceMap) return source;
  return source + "\n//# sourceMappingURL=data:application/json;charset=utf-8;base64," + toBase64(sourceMap);
}
```

and change the `new Function` call in `requirePath` to use it:

```ts
    const fn = new Function(
      "require",
      "exports",
      "module",
      "__v",
      "__ok",
      buildModuleSource(compiled.js, path, compiled.sourceMap),
    );
```

- [ ] **Step 4: Run the tests and watch them pass**

Run: `bun test src/features/testbed/`
Expected: PASS. In particular the Plan 3 line-resolution tests must still pass — if `firstFrameIn` starts failing, the extra trailing line changed the wrapper offset, which would be a real regression rather than a test to adjust.

- [ ] **Step 5: Write the help popover**

Create `src/features/testbed/ui/devtools-help.tsx`:

```tsx
import { HelpCircle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Explains how to use the main-thread debug run, whose order of operations is
 * not guessable — DevTools has to be open before the run starts.
 */
export function DevToolsHelp() {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" aria-label="How to debug with DevTools" className="shrink-0">
          <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm space-y-1 text-xs">
        <p className="font-medium">Debugging with DevTools</p>
        <ol className="list-inside list-decimal space-y-0.5">
          <li>Open DevTools first — it cannot attach to a run already underway.</li>
          <li>Tick this box, then press Run.</li>
          <li>
            Find your test in Sources under its project path, e.g.{" "}
            <code>/my-project/tests/counter.test.ts</code>.
          </li>
          <li>Set a breakpoint there, or put a <code>debugger;</code> statement in the test.</li>
        </ol>
        <p className="text-muted-foreground">
          Tests run in the page instead of a worker, so a contract that loops forever will freeze
          the tab — the watchdog cannot interrupt the loop that is blocking it.
        </p>
      </TooltipContent>
    </Tooltip>
  );
}
```

- [ ] **Step 6: Add it to the toggle**

In `src/features/testbed/ui/test-file-editor.tsx`, add `import { DevToolsHelp } from "./devtools-help";` and replace the existing debug-run `<label>` with:

```tsx
            <label className="flex shrink-0 items-center gap-2 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
              <Checkbox
                checked={debugRun}
                onCheckedChange={(checked) => setDebugRun(checked === true)}
              />
              Debug run (DevTools)
              <DevToolsHelp />
              <span className="text-muted-foreground/70">
                — runs in the page so DevTools can break; a runaway contract will freeze the tab
              </span>
            </label>
```

**Before running the app, check how tooltips are mounted here.** Radix tooltips need a `TooltipProvider` ancestor, and `src/components/ui/tooltip.tsx` may or may not include one in its `Tooltip` export. Read that file: if `Tooltip` already wraps `TooltipProvider`, nothing more is needed; if it does not, wrap the returned markup of `DevToolsHelp` in `<TooltipProvider delayDuration={200}>` rather than adding a provider at the app root. Report which of the two you found.

- [ ] **Step 7: Verify**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "module-registry|devtools-help|test-file-editor" || echo "no errors in changed files"`
Expected: `no errors in changed files`

Run: `bun test src/features/testbed/` and `bun run build`
Expected: both pass

- [ ] **Step 8: Commit**

```bash
git add src/features/testbed/runner/module-registry.ts src/features/testbed/runner/module-registry.test.ts \
        src/features/testbed/ui/devtools-help.tsx src/features/testbed/ui/test-file-editor.tsx
git commit -m "feat(studio): show original TypeScript in DevTools, and explain how"
```

---

## Verification (manual, in a browser)

Run `bun dev` and report what actually happened at each point:

1. Open a `.test.ts` that loads a contract and sends transactions. Press **Run**.
2. Values appear at the end of lines that declare a variable — `counter = 2n` and similar — in the test file.
3. A passing assertion line shows `✓`; a failing one shows the Plan 3 failure in the results panel.
4. The header above the editor names the test the values came from.
5. Click a different test in the results panel — the annotations swap to that test's values, and the header follows.
6. Open a helper file the test imports. Its lines show the values **that test** produced going through it, and the header still names that test.
7. Put a line inside a loop. Its annotation shows the last value and `×N`; hovering lists the individual values.
8. Tick **Debug run (DevTools)**, open DevTools, press Run. Your test appears in Sources as **TypeScript**, not as instrumented JavaScript, and a breakpoint set there is hit.
9. Hover the help icon beside the checkbox and confirm the instructions read correctly.

## Done criteria

- Every binding line in the active test shows its value; repeats show the last value with a count
- Assertion lines show a tick when they completed
- Clicking a results row changes which test's values are displayed, including in helper files
- The editor always states which test the displayed values came from
- DevTools shows original TypeScript for evaluated test modules
- `bun test` passes; `bun run build` succeeds

## What comes next (Plan 4b)

- Static test discovery with acorn, so tests are known before anything runs
- Gutter play buttons, hover-swapped with the Plan 3 status dots
- Cursor-follows-test, replacing results-panel clicking as the primary way to pick the active test
- `RunRequest.filter` riding the existing `.only` machinery, for single-test runs
- Per-test Debug, closing the Plan 3 whole-file recording limitation
