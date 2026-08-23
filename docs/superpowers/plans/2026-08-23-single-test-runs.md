# Single Test Runs Implementation Plan (Plan 4b)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A play button in the gutter beside every `it()` that runs just that test.

**Architecture:** Tests are found by parsing the *emitted* JavaScript with acorn — the editor buffer is TypeScript, which acorn cannot parse, and the emitted form is what the runner sees anyway. The found name path becomes `RunRequest.filter`, which rides the existing `.only` machinery in `test-api.ts` rather than introducing a parallel skip path, so enclosing `beforeAll`/`beforeEach` still run.

**Tech Stack:** Bun, TypeScript, React 19, jotai, Monaco, acorn, `@jridgewell/trace-mapping`.

**Spec:** `docs/superpowers/specs/2026-08-23-test-inline-values-design.md`

---

## Scope

**In:** shared AST helpers, static test discovery, the `filter` field and its use in the runner, and the gutter play button.

**Out (later):** cursor-follows-test replacing results-panel clicking, and per-test Debug. Both build on `find-tests.ts` and are cheap once it exists.

## Findings this plan is built on

- **acorn cannot parse TypeScript.** `let testbed: SimulatorTestbed` is a syntax error. The scan therefore runs on the output of `transpileAll`, and maps lines back through the sourcemap exactly as `instrument.ts` already does.
- **The emitted form is not the written form.** TypeScript compiles `it("x", fn)` into `(0, vitest_1.it)("x", fn)`. Missing this is what made the `__ok` assertion marker silently never fire in the app. The resolver in this plan handles the bare, namespaced and modifier forms, and is tested against all three.
- **`TestCase.path` already includes the test's own name** (`test-api.ts:62`, `path: [...current.path, name]`), and `Suite.path` includes the suite's. So a filter matching `test.path` exactly, and suites by prefix, needs no new bookkeeping.
- **Ids are collection-order counters** (`` `${file}#${nextId++}` ``), so they shift when a test is inserted above. The filter uses the name path, which is stable across edits.

## File Structure

| Path | Responsibility |
|---|---|
| `src/features/testbed/instrument/ast.ts` | Shared acorn helpers: `visit`, `unwrapSequence`, `chainRootName`, the `Node` type |
| `src/features/testbed/instrument/find-tests.ts` | Emitted JS → `FoundTest[]` with name paths and source lines |

Modified: `instrument/instrument.ts`, `runner/types.ts`, `runner/test-api.ts`, `runner/run-request.ts`, `use-test-run.ts`, `ui/use-test-decorations.ts`, `ui/test-file-editor.tsx`, `src/index.css`.

---

## Task 1: Shared AST helpers

**Files:**
- Create: `src/features/testbed/instrument/ast.ts`
- Modify: `src/features/testbed/instrument/instrument.ts`

Pure refactor, no behaviour change. `find-tests.ts` needs the same call-chain resolution `instrument.ts` already has, and duplicating the compiled-form handling is exactly how the two would drift apart.

- [ ] **Step 1: Move the helpers**

Create `src/features/testbed/instrument/ast.ts` containing, moved verbatim from `instrument.ts`: the `Node` type alias, `FUNCTION_TYPES`, `visit`, `unwrapSequence` and `chainRootName`. Export all of them.

Add this to the top of the new file:

```ts
/**
 * acorn helpers shared by the instrumenter and the test scanner.
 *
 * Both walk emitted CommonJS, where TypeScript has rewritten every imported
 * call as `(0, ns.fn)(...)`. Keeping the unwrapping in one place is deliberate:
 * a matcher that only recognised the bare form once shipped a marker that never
 * fired in the app while passing every unit test.
 */
```

- [ ] **Step 2: Import them back**

In `instrument.ts`, delete the moved definitions and add:

```ts
import { visit, chainRootName, type Node } from "./ast";
```

`unwrapSequence` is used only by `chainRootName`, so `instrument.ts` no longer references it directly.

- [ ] **Step 3: Verify nothing moved semantically**

Run: `bun test src/features/testbed/instrument/`
Expected: PASS, 36 tests — the same set as before the move. A failure here means something was transcribed wrongly, not that behaviour needed changing.

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "instrument/" || echo "no errors in changed files"`
Expected: `no errors in changed files`

- [ ] **Step 4: Commit**

```bash
git add src/features/testbed/instrument/ast.ts src/features/testbed/instrument/instrument.ts
git commit -m "refactor(studio): share acorn helpers between instrumenter and scanner"
```

---

## Task 2: Finding the tests

**Files:**
- Create: `src/features/testbed/instrument/find-tests.ts`
- Create: `src/features/testbed/instrument/find-tests.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/instrument/find-tests.test.ts`:

```ts
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
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/instrument/find-tests.test.ts`
Expected: FAIL — `Cannot find module './find-tests'`

- [ ] **Step 3: Write the scanner**

Create `src/features/testbed/instrument/find-tests.ts`:

```ts
import { parse } from "acorn";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { unwrapSequence, type Node } from "./ast";

export type FoundTestMode = "run" | "skip" | "only" | "todo";

export interface FoundTest {
  /** The test's own name. */
  name: string;
  /** Enclosing suite names plus the test's own — the runner's filter key. */
  path: string[];
  /** 1-based line in the user's TypeScript. */
  line: number;
  mode: FoundTestMode;
}

const SUITES = new Set(["describe", "suite"]);
const TESTS = new Set(["it", "test"]);
const MODIFIERS = new Set(["only", "skip", "todo"]);

interface Called {
  base: string;
  modifier?: FoundTestMode;
}

/**
 * Resolves what a call is calling, across the three forms this has to survive:
 * `it(…)`, `it.skip(…)`, and the compiled `(0, vitest_1.it).skip(…)`.
 */
function resolveCallee(node: Node): Called | null {
  const callee = unwrapSequence(node);
  if (!callee) return null;

  if (callee.type === "Identifier") return { base: callee.name as string };

  if (callee.type === "MemberExpression") {
    const property = callee.property as Node;
    if (property?.type !== "Identifier") return null;

    if (MODIFIERS.has(property.name as string)) {
      const inner = resolveCallee(callee.object as Node);
      return inner ? { base: inner.base, modifier: property.name as FoundTestMode } : null;
    }

    // A namespaced import bottoms out at a plain identifier, and the name worth
    // reporting is the property: `vitest_1.it` is "it".
    const object = unwrapSequence(callee.object as Node);
    if (object?.type === "Identifier") return { base: property.name as string };
  }

  return null;
}

/** The first argument, when it is a plain string literal. */
function literalName(node: Node | undefined): string | null {
  if (node?.type !== "Literal") return null;
  return typeof node.value === "string" ? node.value : null;
}

function safeTraceMap(raw: string): TraceMap | null {
  try {
    return new TraceMap(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Finds every `it()` in emitted JavaScript, with the path a runner filter needs
 * and the line in the user's TypeScript.
 *
 * Runs against emitted JS rather than the editor buffer because acorn cannot
 * parse TypeScript — and because the emitted form is what the runner sees.
 *
 * Returns nothing for source it cannot parse, so a half-typed file leaves the
 * previous result standing rather than clearing the gutter on every keystroke.
 */
export function findTests(js: string, sourceMap?: string): FoundTest[] {
  let ast: Node;
  try {
    ast = parse(js, { ecmaVersion: "latest", sourceType: "script", locations: true }) as Node;
  } catch {
    return [];
  }

  const map = sourceMap ? safeTraceMap(sourceMap) : null;

  function lineFor(node: Node): number {
    const generated = node.loc.start.line as number;
    if (!map) return generated;
    const original = originalPositionFor(map, {
      line: generated,
      column: node.loc.start.column as number,
    });
    return original.line ?? generated;
  }

  const found: FoundTest[] = [];

  function walk(node: unknown, path: string[]): void {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const child of node) walk(child, path);
      return;
    }

    const record = node as Node;

    if (record.type === "CallExpression") {
      const called = resolveCallee(record.callee as Node);
      const args = (record.arguments ?? []) as Node[];
      const name = literalName(args[0]);

      if (called && name !== null) {
        if (SUITES.has(called.base)) {
          // Descend with the extended path and stop: falling through to the
          // generic walk below would find this suite's tests a second time.
          if (args[1]) walk(args[1].body, [...path, name]);
          return;
        }

        if (TESTS.has(called.base)) {
          found.push({
            name,
            path: [...path, name],
            line: lineFor(record),
            mode: called.modifier ?? "run",
          });
          // A test inside a test is not a thing worth reporting.
          return;
        }
      }
    }

    for (const key of Object.keys(record)) {
      if (key === "loc" || key === "start" || key === "end" || key === "range") continue;
      walk(record[key], path);
    }
  }

  walk(ast, []);
  return found;
}
```

- [ ] **Step 4: Run the test and watch it pass**

Run: `bun test src/features/testbed/instrument/find-tests.test.ts`
Expected: PASS, 16 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/instrument/find-tests.ts src/features/testbed/instrument/find-tests.test.ts
git commit -m "feat(studio): find tests statically, in written and compiled form"
```

---

## Task 3: Running one test

**Files:**
- Modify: `src/features/testbed/runner/types.ts`
- Modify: `src/features/testbed/runner/test-api.ts`
- Modify: `src/features/testbed/runner/run-request.ts`
- Modify: `src/features/testbed/runner/test-api.test.ts`

The filter rides the existing `.only` machinery. That is the point: `.only` semantics already guarantee enclosing `beforeAll`/`beforeEach` still run, which is exactly what a single-test run needs, since that is where the testbed gets built.

- [ ] **Step 1: Write the failing test**

Append to `src/features/testbed/runner/test-api.test.ts`:

```ts
describe("filtered runs", () => {
  /** Collects the names of tests that actually ran. */
  async function runFiltered(build: (api: any) => void, filter?: string[]) {
    const { api, root } = createCollector("/p/a.test.ts");
    build(api);
    const events: TestEvent[] = [];
    await runSuite(root, "/p/a.test.ts", (event) => events.push(event), filter);
    return events
      .filter((e) => e.type === "test:end" && e.status === "passed")
      .map((e) => (e as any).id);
  }

  it("runs only the named test", async () => {
    const ran = await runFiltered((v) => {
      v.describe("s", () => {
        v.it("one", () => {});
        v.it("two", () => {});
      });
    }, ["s", "two"]);
    expect(ran).toHaveLength(1);
  });

  it("reports the tests it skipped rather than omitting them", async () => {
    const { api, root } = createCollector("/p/a.test.ts");
    api.describe("s", () => {
      api.it("one", () => {});
      api.it("two", () => {});
    });
    const events: TestEvent[] = [];
    await runSuite(root, "/p/a.test.ts", (e) => events.push(e), ["s", "two"]);
    const statuses = events.filter((e) => e.type === "test:end").map((e) => (e as any).status);
    expect(statuses.sort()).toEqual(["passed", "skipped"]);
  });

  it("still runs the hooks the filtered test depends on", async () => {
    const order: string[] = [];
    const { api, root } = createCollector("/p/a.test.ts");
    api.describe("s", () => {
      api.beforeAll(() => void order.push("beforeAll"));
      api.beforeEach(() => void order.push("beforeEach"));
      api.afterEach(() => void order.push("afterEach"));
      api.it("one", () => void order.push("one"));
      api.it("two", () => void order.push("two"));
    });
    await runSuite(root, "/p/a.test.ts", () => {}, ["s", "two"]);
    expect(order).toEqual(["beforeAll", "beforeEach", "two", "afterEach"]);
  });

  it("skips a whole suite the filter does not lead into", async () => {
    const order: string[] = [];
    const { api, root } = createCollector("/p/a.test.ts");
    api.describe("wanted", () => {
      api.it("t", () => void order.push("wanted"));
    });
    api.describe("other", () => {
      api.beforeAll(() => void order.push("other beforeAll"));
      api.it("t", () => void order.push("other"));
    });
    await runSuite(root, "/p/a.test.ts", () => {}, ["wanted", "t"]);
    expect(order).toEqual(["wanted"]);
  });

  it("runs a top-level test with a single-element filter", async () => {
    const ran = await runFiltered((v) => {
      v.it("alone", () => {});
      v.it("other", () => {});
    }, ["alone"]);
    expect(ran).toHaveLength(1);
  });

  it("overrides .only, since the filter is a more explicit request", async () => {
    const order: string[] = [];
    const { api, root } = createCollector("/p/a.test.ts");
    api.it.only("focused", () => void order.push("focused"));
    api.it("asked for", () => void order.push("asked for"));
    await runSuite(root, "/p/a.test.ts", () => {}, ["asked for"]);
    expect(order).toEqual(["asked for"]);
  });

  it("leaves .skip alone, which is a deliberate annotation in the source", async () => {
    const order: string[] = [];
    const { api, root } = createCollector("/p/a.test.ts");
    api.it.skip("skipped", () => void order.push("skipped"));
    await runSuite(root, "/p/a.test.ts", () => {}, ["skipped"]);
    expect(order).toEqual([]);
  });

  it("runs everything when there is no filter", async () => {
    const ran = await runFiltered((v) => {
      v.it("one", () => {});
      v.it("two", () => {});
    });
    expect(ran).toHaveLength(2);
  });
});
```

Add `createCollector`, `runSuite` and the `TestEvent` type to that file's existing imports if they are not already there.

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/runner/test-api.test.ts`
Expected: FAIL — `runSuite` takes three arguments, so the filter is ignored and every test runs

- [ ] **Step 3: Add the field**

In `src/features/testbed/runner/types.ts`, add to `RunRequest`:

```ts
  /**
   * Run only the test at this name path, e.g. `["Counter", "counts up"]`.
   *
   * A name path rather than a test id: ids are collection-order counters, so
   * inserting a test above shifts every id below it.
   */
  filter?: string[];
```

- [ ] **Step 4: Filter in the runner**

In `src/features/testbed/runner/test-api.ts`, widen `runSuite`'s signature with a fourth parameter:

```ts
  filter?: string[],
```

Replace the existing `const onlyMode = hasOnly(root);` line with the following block:

```ts
  // An explicit filter is a more specific request than `.only` in the source,
  // so it wins outright rather than intersecting.
  const onlyMode = filter === undefined && hasOnly(root);

  /** Whether `path` is a prefix of, or equal to, the filter. */
  function leadsToFilter(path: string[]): boolean {
    if (!filter) return true;
    return path.length <= filter.length && path.every((part, at) => part === filter[at]);
  }

  /** Whether `path` is the filtered test itself. */
  function isFilterTarget(path: string[]): boolean {
    if (!filter) return true;
    return path.length === filter.length && leadsToFilter(path);
  }
```

Then add a filter clause to each predicate:

```ts
  /** A suite runs when nothing above skipped it and, in only-mode, it is or contains a focused test. */
  function isSuiteSkipped(node: Suite, skipped: boolean, insideOnly: boolean): boolean {
    if (!leadsToFilter(node.path)) return true;
    return skipped || node.mode === "skip" || (onlyMode && !insideOnly && !hasOnly(node));
  }

  /** A test runs when nothing above skipped it and, in only-mode, it is focused or inside a focused suite. */
  function isTestSkipped(test: TestCase, skipped: boolean, withinOnly: boolean): boolean {
    if (!isFilterTarget(test.path)) return true;
    return skipped || test.mode === "skip" || (onlyMode && !withinOnly && test.mode !== "only");
  }
```

**Note the ordering:** the filter clause comes *first* and returns early, but `test.mode === "skip"` is still checked afterwards — so a filtered `.skip` test stays skipped. That is deliberate: `.skip` is a deliberate annotation in the source, and the gutter will not offer a play button on one.

- [ ] **Step 5: Pass it through**

In `src/features/testbed/runner/run-request.ts`, change the `runSuite` call:

```ts
        await runSuite(root, entry, emitWithTrace, request.filter);
```

- [ ] **Step 6: Verify**

Run: `bun test src/features/testbed/`
Expected: PASS, including every pre-existing `.only` test — the filter must not have changed unfiltered behaviour

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "test-api|run-request|runner/types" || echo "no errors in changed files"`
Expected: `no errors in changed files`

- [ ] **Step 7: Commit**

```bash
git add src/features/testbed/runner/types.ts src/features/testbed/runner/test-api.ts \
        src/features/testbed/runner/test-api.test.ts src/features/testbed/runner/run-request.ts
git commit -m "feat(studio): run a single test by name path"
```

---

## Task 4: Asking for one test

**Files:**
- Modify: `src/features/testbed/use-test-run.ts`
- Modify: `src/features/testbed/ui/test-file-editor.tsx`

`run` already takes three optional positional arguments and is about to take a fourth. Move to an options object before it becomes unreadable — there is exactly one call site.

- [ ] **Step 1: Change the signature**

In `src/features/testbed/use-test-run.ts`, replace the `run` declaration in `UseTestRun`:

```ts
/**
 * Named `TestRunOptions`, not `RunOptions`: `runner-client.ts` already exports a
 * `RunOptions` for the watchdog budget, and two unrelated types under one name
 * in the same feature is a trap.
 */
export interface TestRunOptions {
  /** One `*.test.ts` to run. Omitted, every test file in the project runs. */
  entryPath?: string;
  /** Run on the main thread so DevTools can attach. See `main-thread-transport.ts`. */
  debug?: boolean;
  /** Run only the test at this name path. */
  filter?: string[];
}

export interface UseTestRun {
  state: RunState;
  isRunning: boolean;
  run: (monaco: typeof Monaco, projectFolderId: string, options?: TestRunOptions) => Promise<void>;
}
```

Change the implementation's parameter list to match:

```ts
    async (monaco: typeof Monaco, projectFolderId: string, options: TestRunOptions = {}) => {
      const { entryPath, debug, filter } = options;
```

and pass the filter into the request:

```ts
          { modules, rawFiles: snapshot.rawFiles, entryPaths, filter },
```

- [ ] **Step 2: Update the call site**

In `src/features/testbed/ui/test-file-editor.tsx`, change `runFile`:

```ts
  const runFile = useCallback(
    async (filter?: string[]) => {
      const monaco = monacoRef.current;
      if (!monaco) return;
      // Save first: the runner reads the project from the file system, not the editor buffer.
      await fs.saveFile(file.metadata.id, codeRef.current);
      await run(monaco, projectId, { entryPath: file.metadata.path, debug: debugRun, filter });
    },
    [fs, file.metadata.id, file.metadata.path, projectId, run, debugRun],
  );
```

The header Run action calls `runFile()` with no argument, which still runs the whole file.

- [ ] **Step 3: Verify**

Run: `bun test src/features/testbed/` and `bun run build`
Expected: both pass

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "use-test-run|test-file-editor" || echo "no errors in changed files"`
Expected: `no errors in changed files`

- [ ] **Step 4: Commit**

```bash
git add src/features/testbed/use-test-run.ts src/features/testbed/ui/test-file-editor.tsx
git commit -m "feat(studio): take run options as an object, and carry a filter"
```

---

## Task 5: The play button

**Files:**
- Modify: `src/features/testbed/ui/use-test-decorations.ts`
- Modify: `src/features/testbed/ui/test-file-editor.tsx`
- Modify: `src/index.css`

The glyph margin is one column wide and already holds the status dot from Plan 3. Rather than tracking the hovered line in React, the dot becomes a play triangle **on CSS hover of the glyph itself** — no JavaScript, no re-render per mouse move. Clicks are read with `editor.onMouseDown` against `GUTTER_GLYPH_MARGIN`, the same mechanism `debug-view.tsx:190` uses for breakpoints.

- [ ] **Step 1: Make the gutter runnable**

Rewrite `src/features/testbed/ui/use-test-decorations.ts`:

```ts
import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import type { TestRow } from "../test-run-model";
import type { FoundTest } from "../instrument/find-tests";

const CLASS_FOR_STATUS: Record<string, string> = {
  pending: "test-glyph-pending",
  running: "test-glyph-running",
  passed: "test-glyph-passed",
  failed: "test-glyph-failed",
  timedout: "test-glyph-failed",
  skipped: "test-glyph-skipped",
  todo: "test-glyph-skipped",
};

/**
 * Marks each `it()` in the gutter with its status, and runs that test when the
 * marker is clicked.
 *
 * Two sources feed this. The statically found tests give every `it()` a marker
 * before anything has run, which is what makes a test runnable from a cold
 * file; a finished run then colours the markers it has results for.
 *
 * `.skip` and `.todo` tests get no play affordance: an explicit annotation in
 * the source should not be overridden by a click that looks like any other.
 */
export function useTestDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  rows: TestRow[],
  found: FoundTest[],
  onRunTest?: (path: string[]) => void,
) {
  useEffect(() => {
    if (!editor || !monaco) return;

    const statusByLine = new Map<number, TestRow>();
    for (const row of rows) {
      if (row.line !== undefined) statusByLine.set(row.line, row);
    }

    /** Name path by line, for the tests a click may start. */
    const runnable = new Map<number, string[]>();
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    const seen = new Set<number>();

    for (const test of found) {
      seen.add(test.line);
      const row = statusByLine.get(test.line);
      const status = row?.status;
      const canRun = test.mode !== "skip" && test.mode !== "todo";
      if (canRun) runnable.set(test.line, test.path);

      const statusClass = status ? (CLASS_FOR_STATUS[status] ?? "test-glyph-pending") : "test-glyph-idle";
      const label = test.path.join(" › ");

      decorations.push({
        range: new monaco.Range(test.line, 1, test.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: `${statusClass}${canRun ? " test-glyph-runnable" : ""}`,
          glyphMarginHoverMessage: {
            value: canRun ? `Run ${label}` : `${label} — ${test.mode}`,
          },
        },
      });
    }

    // Results for tests the scan could not see — a computed name, say — still
    // deserve a marker, just not a play button.
    for (const row of rows) {
      if (row.line === undefined || seen.has(row.line)) continue;
      decorations.push({
        range: new monaco.Range(row.line, 1, row.line, 1),
        options: {
          isWholeLine: false,
          glyphMarginClassName: CLASS_FOR_STATUS[row.status] ?? "test-glyph-pending",
          glyphMarginHoverMessage: {
            value: `${row.path.join(" › ")} — ${row.status}${
              row.durationMs !== undefined ? ` (${row.durationMs}ms)` : ""
            }`,
          },
        },
      });
    }

    const collection = editor.createDecorationsCollection(decorations);

    const clicks = editor.onMouseDown((event) => {
      if (!onRunTest) return;
      if (event.target.type !== monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN) return;
      const path = event.target.position && runnable.get(event.target.position.lineNumber);
      if (path) onRunTest(path);
    });

    return () => {
      collection.clear();
      clicks.dispose();
    };
  }, [editor, monaco, rows, found, onRunTest]);
}
```

- [ ] **Step 2: Style the marker**

In `src/index.css`, add `.test-glyph-idle::before` to the shared shape rule so the new marker gets the dot. Replace the selector list:

```css
.test-glyph-pending::before,
.test-glyph-running::before,
.test-glyph-passed::before,
.test-glyph-failed::before,
.test-glyph-skipped::before {
```

with:

```css
.test-glyph-idle::before,
.test-glyph-pending::before,
.test-glyph-running::before,
.test-glyph-passed::before,
.test-glyph-failed::before,
.test-glyph-skipped::before {
```

Then append:

```css
.test-glyph-idle::before { background: rgb(82 82 91); }

/* A runnable marker turns into a play button under the pointer. */
.test-glyph-runnable {
  cursor: pointer;
}
.test-glyph-runnable:hover::before {
  width: 0;
  height: 0;
  margin: 5px 0 0 6px;
  border-radius: 0;
  background: transparent;
  border-top: 5px solid transparent;
  border-bottom: 5px solid transparent;
  border-left: 8px solid rgb(34 197 94);
}
```

- [ ] **Step 3: Scan the file**

In `src/features/testbed/ui/test-file-editor.tsx`, add the imports:

```tsx
import { findTests, type FoundTest } from "../instrument/find-tests";
import { transpileAll } from "../transpile";
```

and, with the other state:

```tsx
  const [foundTests, setFoundTests] = useState<FoundTest[]>([]);
```

Add an effect that rescans the buffer on a debounce. It transpiles because acorn cannot parse TypeScript:

```tsx
  // acorn cannot parse TypeScript, so the scan runs on the emitted JavaScript —
  // which is also the form the runner sees, so both agree about what a test is.
  useEffect(() => {
    const monaco = monacoRef.current;
    if (!monaco) return;

    let cancelled = false;
    const timer = setTimeout(() => {
      transpileAll(monaco, { [file.metadata.path]: code })
        .then((modules) => {
          if (cancelled) return;
          const compiled = modules[file.metadata.path];
          if (!compiled) return;
          setFoundTests(findTests(compiled.js, compiled.sourceMap));
        })
        // A half-typed file simply leaves the previous markers standing.
        .catch(() => {});
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [code, file.metadata.path]);
```

**Note:** this effect reads `monacoRef.current`, which is null until `onMount`. The first scan therefore happens on the first edit or theme change rather than at mount. If markers do not appear on a freshly opened file, that is why — report it rather than adding a forced re-render, and I will decide whether it needs one.

- [ ] **Step 4: Wire the click**

Still in `test-file-editor.tsx`, replace the existing `useTestDecorations(...)` call:

```tsx
  const runSingleTest = useCallback(
    (path: string[]) => {
      runFile(path).catch((e) => toast.error("Could not run test: " + (e as Error).message));
    },
    [runFile],
  );

  useTestDecorations(editorRef.current, monacoRef.current, state.rows, foundTests, runSingleTest);
```

**Careful:** `runFile` is declared below the current `useTestDecorations` call site. Move the `useTestDecorations` and `runSingleTest` lines to *after* `runFile`'s declaration, keeping every hook unconditional and before the component's early `return` for the debug view.

- [ ] **Step 5: Verify**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "use-test-decorations|test-file-editor" || echo "no errors in changed files"`
Expected: `no errors in changed files`

Run: `bun test src/features/testbed/` and `bun run build`
Expected: both pass

- [ ] **Step 6: Commit**

```bash
git add src/features/testbed/ui/use-test-decorations.ts src/features/testbed/ui/test-file-editor.tsx src/index.css
git commit -m "feat(studio): run one test from a play button in the gutter"
```

---

## Verification (manual, in a browser)

Run `bun dev` and report what actually happened at each point:

1. Open a `.test.ts` with several tests. After a moment, a grey dot appears beside every `it()` — **before** any run.
2. Hover a dot — it becomes a green play triangle and the tooltip reads `Run <suite> › <test>`.
3. Click it — only that test runs. The results panel shows the others as skipped.
4. A test whose `beforeEach` builds the testbed still passes, proving hooks ran.
5. Inline values appear for the test you ran, and the header names it.
6. Add `it.skip(...)` — its marker does not offer a play button and clicking does nothing.
7. Press the header **Run** — the whole file runs, as before.
8. Type a syntax error — existing markers stay put rather than vanishing.

## Done criteria

- Every `it()` has a gutter marker before the file has ever been run
- Hovering a runnable marker shows a play triangle; clicking runs just that test
- A filtered run still executes the enclosing `beforeAll`/`beforeEach`
- `.skip` and `.todo` offer no play button
- `bun test` passes; `bun run build` succeeds

## What comes next

- Cursor-follows-test, replacing results-panel clicking as the way to pick the active test — `findTests` gives the lines; it needs ranges, so `FoundTest` would gain an `endLine`
- Per-test Debug: a filtered run of the active test, then the step debugger on its recording, closing the whole-file limitation from Plan 3
