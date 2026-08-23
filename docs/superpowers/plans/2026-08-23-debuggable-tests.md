# Debuggable Tests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Connect a test result to a place you can inspect — the failing line in the editor, and the contract stepping in the simulator.

**Architecture:** Monaco already emits sourcemaps alongside the CommonJS it produces, and evaluated modules already carry a `//# sourceURL`, so stack frames name real project paths. Mapping those frames back through the sourcemap gives every test a source line — which drives gutter icons and click-to-jump. Separately, wrapping `SimulatorTestbed` in a recording proxy captures the exact transaction stream a test produced, which converts into a `ScenarioFile` the existing `DebugView` can step through.

**Tech Stack:** React 19, Monaco, `@jridgewell/trace-mapping`, Bun, the Plan 1 runner and Plan 2 UI.

**Spec:** `docs/superpowers/specs/2026-08-22-browser-test-runner-design.md`
**Builds on:** Plans 1 and 2 — both complete, 97 tests passing, verified working in a browser.

**Working directory:** All commands run from `apps/studio/`.

---

## Scope

**Part A — failure navigation (Tasks 1–7):** every test knows its source line; gutter icons show per-test status; clicking a failure jumps to it.

**Part B — the debugger handoff (Tasks 8–12):** a test records what it did; a Debug button replays that in the existing step debugger; a debug-run mode executes on the main thread so DevTools can attach.

The two parts are independent and can be executed separately — Part A ends with a working, more usable runner; Part B adds a capability on top.

**Out, deferred to Plan 4:** the session→test generator with the pin-expectations dialog, generating `.d.ts` from the installed packages (Plan 2 ships a hand-written facade), run-all-files across a project, and click-to-run a single test from the gutter (which needs a filter in `RunRequest`).

---

## Findings this plan is built on

All four were verified by spike before writing, not assumed:

1. **`@jridgewell/trace-mapping` maps correctly.** Against real `tsc` output, generated `6:8` → original line 5. It is browser-safe and has no Node dependencies.
2. **Stack frames carry the real path.** Because the module registry appends `//# sourceURL=<vfs path>`, a throw inside evaluated code produces `at <anonymous> (/proj/tests/a.test.ts:4:45)`.
3. **`new Function` shifts line numbers, and the shift must be measured.** Code on body line 2 was reported at line 4. The offset is 2 on Bun today and 2 on V8, but hardcoding it would break silently on another engine — so Task 1 detects it at runtime with a probe.
4. **Columns are not shifted**, only lines — the wrapper ends with a newline, so body columns start at 0 as usual.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/features/testbed/source-position.ts` | Parse stack frames; measure the `new Function` line offset |
| `src/features/testbed/line-resolver.ts` | Stack + sourcemap → original source line |
| `src/features/testbed/runner/test-api.ts` | *(modify)* capture each test's definition site; emit a run plan |
| `src/features/testbed/runner/types.ts` | *(modify)* `run:plan` event |
| `src/features/testbed/test-run-model.ts` | *(modify)* pre-create rows from the plan; carry `line` |
| `src/features/testbed/use-test-run.ts` | *(modify)* resolve lines before folding events |
| `src/features/testbed/ui/use-test-decorations.ts` | Monaco glyph-margin decorations per test |
| `src/features/testbed/ui/test-file-editor.tsx` | *(modify)* decorations; jump-to-line on failure click |
| `src/features/testbed/ui/test-results-panel.tsx` | *(modify)* clickable failures; Debug button |
| `src/features/simulator/scenario/scenario.types.ts` | *(modify)* `messageHex` on `ScenarioTx` |
| `src/features/testbed/runner/recording.ts` | Proxy over `SimulatorTestbed` capturing contract + tx stream |
| `src/features/testbed/to-debug-scenario.ts` | Recording → `ScenarioFile` |
| `src/features/testbed/main-thread-transport.ts` | In-process transport for debug runs |

---

# Part A — Failure navigation

## Task 1: Stack frames and the wrapper offset

**Files:**
- Modify: `apps/studio/package.json`
- Create: `src/features/testbed/source-position.ts`
- Test: `src/features/testbed/source-position.test.ts`

- [ ] **Step 1: Install the sourcemap reader**

```bash
bun add @jridgewell/trace-mapping
```

- [ ] **Step 2: Write the failing test**

Create `src/features/testbed/source-position.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { detectWrapperOffset, firstFrameIn } from "./source-position";

describe("firstFrameIn", () => {
  it("parses a Bun/JSC frame", () => {
    const stack = [
      "Error: kaboom",
      "    at <anonymous> (/proj/tests/a.test.ts:4:45)",
      "    at <anonymous> (/elsewhere/runner.ts:22:15)",
    ].join("\n");
    expect(firstFrameIn(stack, "/proj/tests/a.test.ts")).toEqual({
      file: "/proj/tests/a.test.ts",
      line: 4,
      column: 45,
    });
  });

  it("parses a V8 frame with a function name", () => {
    const stack = ["Error: x", "    at Object.run (/proj/tests/a.test.ts:12:9)"].join("\n");
    expect(firstFrameIn(stack, "/proj/tests/a.test.ts")?.line).toBe(12);
  });

  it("parses a V8 frame with no function name", () => {
    const stack = ["Error: x", "    at /proj/tests/a.test.ts:7:3"].join("\n");
    expect(firstFrameIn(stack, "/proj/tests/a.test.ts")?.line).toBe(7);
  });

  it("skips frames from other files", () => {
    const stack = [
      "Error: x",
      "    at <anonymous> (/other/helper.ts:1:1)",
      "    at <anonymous> (/proj/tests/a.test.ts:9:2)",
    ].join("\n");
    expect(firstFrameIn(stack, "/proj/tests/a.test.ts")?.line).toBe(9);
  });

  it("returns null when the file never appears", () => {
    expect(firstFrameIn("Error: x\n    at /other/a.ts:1:1", "/proj/a.test.ts")).toBeNull();
  });

  it("returns null for an empty or malformed stack", () => {
    expect(firstFrameIn("", "/proj/a.test.ts")).toBeNull();
    expect(firstFrameIn("no frames here", "/proj/a.test.ts")).toBeNull();
  });
});

describe("detectWrapperOffset", () => {
  it("measures how many lines new Function prepends", () => {
    expect(detectWrapperOffset()).toBeGreaterThanOrEqual(0);
  });

  it("produces an offset that actually corrects a real frame", () => {
    const offset = detectWrapperOffset();
    const body = [
      "'use strict';",
      "// filler",
      "throw new Error('here');",
      "//# sourceURL=/probe.js",
    ].join("\n");

    try {
      new Function(body)();
      throw new Error("should have thrown");
    } catch (error) {
      const frame = firstFrameIn(String((error as Error).stack), "/probe.js");
      // The throw is on body line 3; the corrected frame must say so.
      expect(frame!.line - offset).toBe(3);
    }
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bun test src/features/testbed/source-position.test.ts`
Expected: FAIL — cannot find module `./source-position`

- [ ] **Step 4: Write the implementation**

Create `src/features/testbed/source-position.ts`:

```ts
export interface StackFrame {
  file: string;
  line: number;
  column: number;
}

// Matches the tail of a stack line in both shapes engines produce:
//   at name (/path/file.ts:12:9)
//   at /path/file.ts:12:9
const FRAME = /\(?([^()\s]+):(\d+):(\d+)\)?$/;

/**
 * The first frame belonging to `file`, or null.
 *
 * Frames name real project paths because the module registry appends
 * `//# sourceURL=<path>` to everything it evaluates.
 */
export function firstFrameIn(stack: string, file: string): StackFrame | null {
  for (const raw of stack.split("\n")) {
    const match = FRAME.exec(raw.trim());
    if (!match || match[1] !== file) continue;
    return { file: match[1], line: Number(match[2]), column: Number(match[3]) };
  }
  return null;
}

/**
 * How many lines `new Function` prepends before the body it is given.
 *
 * Every line number in a stack from evaluated code is shifted by this much.
 * It is 2 on both V8 and JSC today, but it is measured rather than assumed:
 * a wrong constant would put every gutter icon and every jump-to-line two
 * lines off, which reads as "roughly right" and wastes an afternoon.
 */
export function detectWrapperOffset(): number {
  const probe = new Function("return new Error().stack;\n//# sourceURL=__wrapper_probe__");
  const frame = firstFrameIn(String(probe()), "__wrapper_probe__");
  // The probe's `return` is on body line 1, so the offset is whatever was added.
  return frame ? frame.line - 1 : 2;
}
```

- [ ] **Step 5: Run the test**

Run: `bun test src/features/testbed/source-position.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 6: Commit**

```bash
git add package.json ../../bun.lock src/features/testbed/source-position.ts src/features/testbed/source-position.test.ts
git commit -m "feat(studio): parse stack frames and measure the eval line offset"
```

---

## Task 2: Mapping a frame to a source line

**Files:**
- Create: `src/features/testbed/line-resolver.ts`
- Test: `src/features/testbed/line-resolver.test.ts`

The fixture below is real `tsc` output, not hand-written: source line 5 (`expect(1n).toBe(2n);`) becomes generated line 6, and the map resolves generated `6:8` back to original line 5.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/line-resolver.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createLineResolver } from "./line-resolver";
import type { CompiledModule } from "./runner/types";

/**
 * Real output of `tsc --module commonjs --sourceMap` for:
 *
 *   1| import { describe, it, expect } from "vitest";
 *   2|
 *   3| describe("Counter", () => {
 *   4|   it("counts", () => {
 *   5|     expect(1n).toBe(2n);
 *   6|   });
 *   7| });
 *
 * The `expect` lands on generated line 6.
 */
const SOURCE_MAP =
  '{"version":3,"file":"counter.test.js","sourceRoot":"","sources":["counter.test.ts"],"names":[],' +
  '"mappings":";;AAAA,mCAA8C;AAE9C,IAAA,iBAAQ,EAAC,SAAS,EAAE,GAAG,EAAE;IACvB,IAAA,WAAE,EAAC,QAAQ,EAAE,GAAG,EAAE;QAChB,IAAA,eAAM,EAAC,EAAE,CAAC,CAAC,IAAI,CAAC,EAAE,CAAC,CAAC;IACtB,CAAC,CAAC,CAAC;AACL,CAAC,CAAC,CAAC"}';

const FILE = "/proj/tests/counter.test.ts";
const modules: Record<string, CompiledModule> = {
  [FILE]: { js: "// irrelevant to mapping", sourceMap: SOURCE_MAP },
};

/** A stack as the engine reports it: generated line + the wrapper offset. */
const stackAt = (line: number, column: number, file = FILE) =>
  `Error: boom\n    at <anonymous> (${file}:${line}:${column})`;

describe("createLineResolver", () => {
  it("maps a frame back to the original line", () => {
    const resolve = createLineResolver(modules, 2);
    // Generated 6:8 is the `expect` call → original line 5.
    expect(resolve(stackAt(8, 8), FILE)).toBe(5);
  });

  it("maps the it() call site", () => {
    const resolve = createLineResolver(modules, 2);
    // Generated 5:4 → original line 4.
    expect(resolve(stackAt(7, 4), FILE)).toBe(4);
  });

  it("maps the describe() call site", () => {
    const resolve = createLineResolver(modules, 2);
    // Generated 4:0 → original line 3.
    expect(resolve(stackAt(6, 0), FILE)).toBe(3);
  });

  it("subtracts the wrapper offset before consulting the map", () => {
    // With a wrong offset the answer must differ, proving the offset is applied.
    const withZero = createLineResolver(modules, 0);
    expect(withZero(stackAt(8, 8), FILE)).not.toBe(5);
  });

  it("returns undefined when the file has no sourcemap", () => {
    const resolve = createLineResolver({ [FILE]: { js: "x" } }, 2);
    expect(resolve(stackAt(8, 8), FILE)).toBeUndefined();
  });

  it("returns undefined when the stack names no matching frame", () => {
    const resolve = createLineResolver(modules, 2);
    expect(resolve(stackAt(8, 8, "/other.ts"), FILE)).toBeUndefined();
  });

  it("returns undefined for a missing stack", () => {
    const resolve = createLineResolver(modules, 2);
    expect(resolve(undefined, FILE)).toBeUndefined();
  });

  it("survives a corrupt sourcemap instead of throwing", () => {
    const resolve = createLineResolver({ [FILE]: { js: "x", sourceMap: "{not json" } }, 2);
    expect(resolve(stackAt(8, 8), FILE)).toBeUndefined();
  });

  it("parses each sourcemap only once across repeated lookups", () => {
    const resolve = createLineResolver(modules, 2);
    expect(resolve(stackAt(8, 8), FILE)).toBe(5);
    expect(resolve(stackAt(7, 4), FILE)).toBe(4);
    expect(resolve(stackAt(8, 8), FILE)).toBe(5);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

Run: `bun test src/features/testbed/line-resolver.test.ts`
Expected: FAIL — cannot find module `./line-resolver`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/line-resolver.ts`:

```ts
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { firstFrameIn } from "./source-position";
import type { CompiledModule } from "./runner/types";

export type LineResolver = (stack: string | undefined, file: string) => number | undefined;

/**
 * Builds a resolver turning a stack trace into a line in the user's TypeScript.
 *
 * Two corrections stand between a raw frame and a useful line: the frame's line
 * includes the lines `new Function` prepends, and the remainder addresses the
 * transpiled JavaScript rather than the source. Sourcemaps are parsed lazily and
 * cached, since one run resolves many frames from the same few files.
 */
export function createLineResolver(
  modules: Record<string, CompiledModule>,
  wrapperOffset: number,
): LineResolver {
  const maps = new Map<string, TraceMap | null>();

  function mapFor(file: string): TraceMap | null {
    const cached = maps.get(file);
    if (cached !== undefined) return cached;

    const raw = modules[file]?.sourceMap;
    let parsed: TraceMap | null = null;
    if (raw) {
      try {
        parsed = new TraceMap(JSON.parse(raw));
      } catch {
        // A corrupt map costs a jump-to-line, not the run.
        parsed = null;
      }
    }
    maps.set(file, parsed);
    return parsed;
  }

  return (stack, file) => {
    if (!stack) return undefined;

    const frame = firstFrameIn(stack, file);
    if (!frame) return undefined;

    const map = mapFor(file);
    if (!map) return undefined;

    const position = originalPositionFor(map, {
      line: frame.line - wrapperOffset,
      column: frame.column,
    });

    return position.line ?? undefined;
  };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test src/features/testbed/line-resolver.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/line-resolver.ts src/features/testbed/line-resolver.test.ts
git commit -m "feat(studio): resolve stack frames to source lines via sourcemaps"
```

---

## Task 3: A run plan, so every test has a line

**Files:**
- Modify: `src/features/testbed/runner/types.ts`
- Modify: `src/features/testbed/runner/test-api.ts`
- Test: `src/features/testbed/runner/run-plan.test.ts`

Today the UI only learns a test exists when it starts — and skipped tests never start, so they arrive at `test:end` with an id and nothing else. The results panel has to invent a label for them. Emitting the collected plan up front fixes that *and* supplies each test's definition site for the gutter.

- [ ] **Step 1: Add the event**

In `src/features/testbed/runner/types.ts`, add to the `TestEvent` union:

```ts
  | { type: "run:plan"; file: string; tests: { id: string; name: string; path: string[]; stack?: string; line?: number }[] }
```

- [ ] **Step 2: Write the failing test**

Create `src/features/testbed/runner/run-plan.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createCollector, runSuite } from "./test-api";
import type { TestEvent } from "./types";

async function eventsFor(build: (api: any) => void) {
  const { api, root } = createCollector("/x.test.ts");
  build(api);
  const events: TestEvent[] = [];
  await runSuite(root, "/x.test.ts", (e) => events.push(e));
  return events;
}

describe("run:plan", () => {
  it("is emitted before any test runs", async () => {
    const events = await eventsFor((api) => {
      api.it("a", () => {});
    });
    expect(events[0].type).toBe("run:plan");
  });

  it("lists every test including skipped and todo ones", async () => {
    const events = await eventsFor((api) => {
      api.describe("outer", () => {
        api.it("runs", () => {});
        api.it.skip("skipped", () => {});
        api.it.todo("later");
      });
    });
    const plan = events[0] as any;
    expect(plan.tests.map((t: any) => t.name)).toEqual(["runs", "skipped", "later"]);
  });

  it("carries each test's full path for labelling", async () => {
    const events = await eventsFor((api) => {
      api.describe("outer", () => {
        api.describe("inner", () => {
          api.it("deep", () => {});
        });
      });
    });
    expect((events[0] as any).tests[0].path).toEqual(["outer", "inner", "deep"]);
  });

  it("captures a definition stack naming the test file", async () => {
    const events = await eventsFor((api) => {
      api.it("a", () => {});
    });
    const stack = (events[0] as any).tests[0].stack as string;
    expect(typeof stack).toBe("string");
    expect(stack.length).toBeGreaterThan(0);
  });

  it("uses the same ids the test:end events use", async () => {
    const events = await eventsFor((api) => {
      api.it("a", () => {});
    });
    const planned = (events[0] as any).tests[0].id;
    const ended = events.find((e) => e.type === "test:end") as any;
    expect(ended.id).toBe(planned);
  });
});
```

- [ ] **Step 3: Run it and watch it fail**

Run: `bun test src/features/testbed/runner/run-plan.test.ts`
Expected: FAIL — the first event is `test:start`, not `run:plan`

- [ ] **Step 4: Capture the definition site during collection**

In `src/features/testbed/runner/test-api.ts`, add `stack` to the `TestCase` interface:

```ts
export interface TestCase {
  kind: "test";
  id: string;
  name: string;
  path: string[];
  mode: TestMode;
  fn: () => unknown;
  /** Where `it()` was called, for mapping back to a source line. */
  stack?: string;
}
```

and capture it in `addTest`, where the case object is built:

```ts
      stack: new Error().stack,
```

- [ ] **Step 5: Emit the plan**

In the same file, add this helper beside `hasOnly`:

```ts
function collectTests(node: Suite, into: TestCase[]): TestCase[] {
  for (const child of node.children) {
    if (child.kind === "suite") collectTests(child, into);
    else into.push(child);
  }
  return into;
}
```

and emit the plan as the first statement of `runSuite`'s body, before `const onlyMode = ...`:

```ts
  // Announce every collected test before running, so the UI can show them all
  // as pending — including skipped and todo tests, which never emit test:start.
  emit({
    type: "run:plan",
    file,
    tests: collectTests(root, []).map((test) => ({
      id: test.id,
      name: test.name,
      path: test.path,
      stack: test.stack,
    })),
  });
```

- [ ] **Step 6: Run the tests**

Run: `bun test src/features/testbed/runner/`
Expected: PASS — the new 5 plus all existing runner tests

If an existing test now fails because it asserted on `events[0]`, that is a real consequence of this change: update that assertion to account for the leading `run:plan`, and say so in your report.

- [ ] **Step 7: Commit**

```bash
git add src/features/testbed/runner/types.ts src/features/testbed/runner/test-api.ts src/features/testbed/runner/run-plan.test.ts
git commit -m "feat(studio): announce the collected test plan before running"
```

---

## Task 4: Carry lines into the run state

**Files:**
- Modify: `src/features/testbed/test-run-model.ts`
- Modify: `src/features/testbed/test-run-model.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to the existing `describe("test-run-model", ...)` block in `src/features/testbed/test-run-model.test.ts`:

```ts
  it("pre-creates pending rows from the run plan", () => {
    const s = fold([
      {
        type: "run:plan",
        file: "/a.test.ts",
        tests: [
          { id: "a#0", name: "one", path: ["s", "one"] },
          { id: "a#1", name: "two", path: ["s", "two"] },
        ],
      },
    ]);
    expect(s.rows.map((r) => r.status)).toEqual(["pending", "pending"]);
    expect(s.rows[1]).toMatchObject({ id: "a#1", name: "two", file: "/a.test.ts" });
  });

  it("updates the planned row rather than adding a second one", () => {
    const s = fold([
      { type: "run:plan", file: "/a.test.ts", tests: [{ id: "a#0", name: "one", path: ["one"] }] },
      { type: "test:start", id: "a#0", name: "one", path: ["one"], file: "/a.test.ts" },
      { type: "test:end", id: "a#0", status: "passed", durationMs: 4 },
    ]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ status: "passed", durationMs: 4 });
  });

  it("gives a skipped test its real name, not a synthesised one", () => {
    const s = fold([
      { type: "run:plan", file: "/a.test.ts", tests: [{ id: "a#0", name: "skipped one", path: ["s", "skipped one"] }] },
      { type: "test:end", id: "a#0", status: "skipped", durationMs: 0 },
    ]);
    expect(s.rows[0].name).toBe("skipped one");
    expect(s.rows[0].path).toEqual(["s", "skipped one"]);
  });

  it("keeps a line supplied with the plan", () => {
    const s = fold([
      {
        type: "run:plan",
        file: "/a.test.ts",
        tests: [{ id: "a#0", name: "one", path: ["one"], line: 12 }],
      },
    ]);
    expect(s.rows[0].line).toBe(12);
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `bun test src/features/testbed/test-run-model.test.ts`
Expected: FAIL — `run:plan` is unhandled, so no rows appear

- [ ] **Step 3: Implement**

In `src/features/testbed/test-run-model.ts`:

1. Widen `TestRow`:

```ts
export interface TestRow {
  id: string;
  name: string;
  path: string[];
  file: string;
  status: TestStatus | "running" | "pending";
  /** 1-based line of the `it()` in the user's source, when it could be resolved. */
  line?: number;
  durationMs?: number;
  failure?: TestFailure;
  logs: LogLine[];
}
```

2. Handle the new event, as the first case in `reduceEvent`'s switch:

```ts
    case "run:plan": {
      const rows = [...state.rows];
      const index = { ...state.index };
      for (const test of event.tests) {
        if (index[test.id] !== undefined) continue;
        rows.push({
          id: test.id,
          name: test.name,
          path: test.path,
          file: event.file,
          status: "pending",
          line: test.line,
          logs: [],
        });
        index[test.id] = rows.length - 1;
      }
      return { ...state, status: "running", rows, index };
    }
```

3. In the `test:end` case, the fallback that synthesises a row from an id now only fires when no plan arrived. Leave it in place as a safety net, but add a comment saying so:

```ts
        // Only reached when no run:plan preceded this — a planned run already
        // has a row carrying the test's real name and path.
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/features/testbed/test-run-model.test.ts`
Expected: PASS, 15 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/test-run-model.ts src/features/testbed/test-run-model.test.ts
git commit -m "feat(studio): show planned tests as pending with real names"
```

---

## Task 5: Resolve lines during a run

**Files:**
- Modify: `src/features/testbed/use-test-run.ts`

The worker cannot resolve lines: mapping needs the sourcemaps, and doing it there would ship a sourcemap parser into the worker for no reason. The client already holds the transpiled modules, so it maps events as they arrive.

- [ ] **Step 1: Resolve plan and failure lines**

In `src/features/testbed/use-test-run.ts`, add the imports:

```ts
import { createLineResolver } from "./line-resolver";
import { detectWrapperOffset } from "./source-position";
```

Inside `run`, after `const modules = await transpileAll(monaco, snapshot.tsFiles);` add:

```ts
        // Stacks come back addressing the transpiled JS inside a `new Function`
        // wrapper; the resolver undoes both to reach the user's line.
        const resolveLine = createLineResolver(modules, detectWrapperOffset());
```

Then replace the `emit` callback passed to `runTests` with one that enriches events before folding:

```ts
          (event) => {
            const enriched =
              event.type === "run:plan"
                ? {
                    ...event,
                    tests: event.tests.map((test) => ({
                      ...test,
                      line: resolveLine(test.stack, event.file),
                    })),
                  }
                : event.type === "test:end" && event.failure
                  ? {
                      ...event,
                      failure: {
                        ...event.failure,
                        // Test ids are `<file>#<n>`, so the file is the id's prefix —
                        // correct even when a run spans several files.
                        line: resolveLine(event.failure.stack, event.id.split("#")[0]),
                      },
                    }
                  : event;

            latest.current = reduceEvent(latest.current, enriched as typeof event);
            setState(latest.current);
          },
```

- [ ] **Step 2: Widen `TestFailure` to carry the resolved line**

In `src/features/testbed/runner/types.ts`:

```ts
export interface TestFailure {
  message: string;
  expected?: unknown;
  actual?: unknown;
  stack?: string;
  /** 1-based source line, filled in by the client after mapping. */
  line?: number;
}
```

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "use-test-run|line-resolver|source-position" || echo "no errors in changed files"`
Expected: `no errors in changed files`

Run: `bun test src/features/testbed/`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/features/testbed/use-test-run.ts src/features/testbed/runner/types.ts
git commit -m "feat(studio): resolve test and failure lines as events arrive"
```

---

## Task 6: Gutter decorations

**Files:**
- Create: `src/features/testbed/ui/use-test-decorations.ts`
- Modify: `src/features/testbed/ui/test-file-editor.tsx`

Follow the existing pattern in `src/features/simulator/ui/use-debug-decorations.ts` — read it first; it does the same job for breakpoints.

- [ ] **Step 1: Write the hook**

Create `src/features/testbed/ui/use-test-decorations.ts`:

```ts
import { useEffect } from "react";
import type * as Monaco from "monaco-editor";
import type { TestRow } from "../test-run-model";

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
 * Marks each `it()` in the gutter with its current status.
 *
 * Rows without a resolved line are skipped rather than guessed at — a marker on
 * the wrong line is worse than no marker.
 */
export function useTestDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  rows: TestRow[],
) {
  useEffect(() => {
    if (!editor) return;

    const decorations = rows
      .filter((row) => row.line !== undefined)
      .map((row) => ({
        range: {
          startLineNumber: row.line!,
          startColumn: 1,
          endLineNumber: row.line!,
          endColumn: 1,
        },
        options: {
          isWholeLine: false,
          glyphMarginClassName: CLASS_FOR_STATUS[row.status] ?? "test-glyph-pending",
          glyphMarginHoverMessage: {
            value: `${row.path.join(" › ")} — ${row.status}${
              row.durationMs !== undefined ? ` (${row.durationMs}ms)` : ""
            }`,
          },
        },
      }));

    const collection = editor.createDecorationsCollection(decorations);
    return () => collection.clear();
  }, [editor, rows]);
}
```

- [ ] **Step 2: Add the glyph styles**

Append to `src/index.css`:

```css
/* Test status markers in the editor gutter. */
.test-glyph-pending::before,
.test-glyph-running::before,
.test-glyph-passed::before,
.test-glyph-failed::before,
.test-glyph-skipped::before {
  content: "";
  display: block;
  width: 8px;
  height: 8px;
  margin: 6px 0 0 6px;
  border-radius: 9999px;
}
.test-glyph-pending::before { background: rgb(113 113 122); }
.test-glyph-running::before { background: rgb(59 130 246); }
.test-glyph-passed::before  { background: rgb(34 197 94); }
.test-glyph-failed::before  { background: rgb(239 68 68); }
.test-glyph-skipped::before { background: rgb(82 82 91); }
```

- [ ] **Step 3: Wire it into the editor**

In `src/features/testbed/ui/test-file-editor.tsx`:

1. Keep a ref to the editor instance — `onMount` already receives it as its first argument, currently ignored as `_editor`. Store it:

```ts
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
```

and in `onMount`, `editorRef.current = editor;` (rename the parameter from `_editor`).

2. Turn on the glyph margin in the `Editor` options:

```ts
          options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false, glyphMargin: true }}
```

3. Call the hook:

```ts
  useTestDecorations(editorRef.current, state.rows);
```

**Note:** `editorRef.current` is null on first render, so the decorations appear once a state change re-renders after mount. If in manual testing the markers do not appear until the first run, that is why — say so in your report rather than adding a forced re-render, and I will decide whether it needs one.

- [ ] **Step 4: Verify**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "use-test-decorations|test-file-editor" || echo "no errors in changed files"`
Expected: `no errors in changed files`

Run: `bun run build`
Expected: succeeds

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/ui/use-test-decorations.ts src/features/testbed/ui/test-file-editor.tsx src/index.css
git commit -m "feat(studio): show test status in the editor gutter"
```

---

## Task 7: Jump to a failure

**Files:**
- Modify: `src/features/testbed/ui/test-results-panel.tsx`
- Modify: `src/features/testbed/ui/test-file-editor.tsx`

- [ ] **Step 1: Make rows clickable**

In `src/features/testbed/ui/test-results-panel.tsx`:

1. Widen the props:

```tsx
export function TestResultsPanel({
  state,
  onRevealLine,
}: {
  state: RunState;
  onRevealLine?: (line: number) => void;
}) {
```

2. Pass the callback down to `TestRowView`:

```tsx
function TestRowView({ row, onRevealLine }: { row: TestRow; onRevealLine?: (line: number) => void }) {
```

and at the call site: `<TestRowView key={row.id} row={row} onRevealLine={onRevealLine} />`

3. Make the row header a button when a line is known — a `div` with an onClick is not reachable by keyboard:

```tsx
      <div className="flex items-center gap-2">
        {STATUS_ICON[row.status]}
        {row.line !== undefined && onRevealLine ? (
          <button
            type="button"
            onClick={() => onRevealLine(row.line!)}
            className="truncate text-left hover:underline"
            title={`Go to line ${row.line}`}
          >
            {row.path.length ? row.path.join(" › ") : row.name}
          </button>
        ) : (
          <span className="truncate">{row.path.length ? row.path.join(" › ") : row.name}</span>
        )}
        {row.durationMs !== undefined && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{row.durationMs}ms</span>
        )}
      </div>
```

4. Make the failure message jump to the failing line specifically, which is usually deeper than the `it()`:

```tsx
          <div
            className={row.failure.line !== undefined && onRevealLine ? "cursor-pointer text-red-400 hover:underline" : "text-red-400"}
            onClick={() => row.failure?.line !== undefined && onRevealLine?.(row.failure.line)}
          >
            {row.failure.message}
          </div>
```

Also add `pending` to `STATUS_ICON` so planned-but-not-started rows render — reuse the skipped icon shape with `text-muted-foreground`.

- [ ] **Step 2: Implement revealing in the editor**

In `src/features/testbed/ui/test-file-editor.tsx`:

```ts
  const revealLine = useCallback((line: number) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.revealLineInCenter(line);
    editor.setPosition({ lineNumber: line, column: 1 });
    editor.focus();
  }, []);
```

and pass it: `<TestResultsPanel state={state} onRevealLine={revealLine} />`

- [ ] **Step 3: Verify**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "test-results-panel|test-file-editor" || echo "no errors in changed files"`
Expected: `no errors in changed files`

Run: `bun test src/features/testbed/` and `bun run build`
Expected: both pass

- [ ] **Step 4: Commit**

```bash
git add src/features/testbed/ui/test-results-panel.tsx src/features/testbed/ui/test-file-editor.tsx
git commit -m "feat(studio): jump from a result to its line"
```

---

## Part A verification (manual, in a browser)

Run `bun dev` and confirm, reporting what actually happened at each point:

1. Open a `.test.ts` with several tests — gutter dots appear next to each `it()` after the first run
2. Run — dots turn green/red, and hovering one shows the test name, status and duration
3. Click a failing test's name — the editor scrolls to its `it()` line
4. Click the failure message — the editor scrolls to the failing assertion, deeper inside the test
5. Add `it.skip(...)` — it appears in the panel with its real name, not an id-derived placeholder

---

# Part B — The debugger handoff

## Task 8: `messageHex` through the scenario pipeline

**Files:**
- Modify: `src/features/simulator/scenario/scenario.types.ts`
- Modify: `src/features/simulator/scenario/scenario-io.ts`
- Modify: `src/features/simulator/scenario/to-engine-txs.ts`
- Modify: `src/features/simulator/engine/simulator-engine.ts`
- Modify: `src/features/simulator/scenario/to-engine-txs.test.ts`
- Modify: `src/features/simulator/scenario/scenario-io.test.ts`

Contract calls commonly encode arguments with `asHexMessage`, but the scenario format only carries `message` (text). Without this, a recorded test cannot be replayed in the debugger.

- [ ] **Step 1: Write the failing tests**

In `src/features/simulator/scenario/to-engine-txs.test.ts`, append inside the existing describe:

```ts
  it("passes messageHex through to the engine", () => {
    const scenario = {
      version: 2 as const,
      creator: "555",
      accounts: [],
      transactions: [{ block: 1, sender: "1001", amount: "1", messageHex: "0100000000000000" }],
    };
    expect(toEngineTxs(scenario, "999")[0].messageHex).toBe("0100000000000000");
  });
```

In `src/features/simulator/scenario/scenario-io.test.ts`, append:

```ts
  it("accepts an optional messageHex", () => {
    const ok = {
      version: 2,
      creator: "555",
      accounts: [],
      transactions: [{ block: 1, sender: "1001", amount: "1", messageHex: "00ff" }],
    };
    expect(validateScenario(ok).valid).toBe(true);
  });

  it("rejects a non-string messageHex", () => {
    const bad = {
      version: 2,
      creator: "555",
      accounts: [],
      transactions: [{ block: 1, sender: "1001", amount: "1", messageHex: 42 }],
    };
    expect(validateScenario(bad).valid).toBe(false);
  });
```

- [ ] **Step 2: Run and watch them fail**

Run: `bun test src/features/simulator/scenario/`
Expected: FAIL — `messageHex` is dropped by `toEngineTxs`, and validation ignores it

- [ ] **Step 3: Thread it through**

`scenario.types.ts` — add to `ScenarioTx`:

```ts
  messageHex?: string; // → messageHex; hex-encoded payload, as `asHexMessage` produces
```

`scenario-io.ts` — inside the per-transaction validation, alongside the `message` check:

```ts
      if (t?.messageHex !== undefined && typeof t.messageHex !== "string")
        errors.push(`transactions[${i}] messageHex must be a string`);
```

`to-engine-txs.ts` — add to `EngineTx`:

```ts
  messageHex?: string;
```

and in the mapper, beside the `message` line:

```ts
    if (tx.messageHex !== undefined) t.messageHex = tx.messageHex;
```

`simulator-engine.ts` — in `submitScenario`, where txs are mapped for the engine, add alongside the existing `messageText` spread:

```ts
      ...(t.messageHex ? { messageHex: t.messageHex } : {}),
```

- [ ] **Step 4: Run the tests**

Run: `bun test src/features/simulator/`
Expected: PASS, all existing plus the 3 new

- [ ] **Step 5: Commit**

```bash
git add src/features/simulator/scenario src/features/simulator/engine/simulator-engine.ts
git commit -m "feat(studio): carry messageHex through the scenario pipeline"
```

---

## Task 9: Record what a test did

**Files:**
- Create: `src/features/testbed/runner/recording.ts`
- Modify: `src/features/testbed/runner/run-request.ts`
- Test: `src/features/testbed/runner/recording.test.ts`

To replay a test in the debugger we need the contract it loaded and the exact transactions it sent. Both are observable by wrapping the class the test uses.

Two details make the recording exact rather than approximate:
- `loadContract(code, options)` receives the **source**, so nothing has to be resolved
- `sendTransactionAndGetResponse` **mutates `tx.blockheight` in place** before appending, so transactions must be captured *after* the call, not before

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/recording.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createRecorder } from "./recording";

/** Stand-in for SimulatorTestbed with the two methods the recorder observes. */
class FakeTestbed {
  loaded: string[] = [];
  loadContract(code: string, options?: unknown) {
    this.loaded.push(code);
    return this;
  }
  runScenario(txs?: any[]) {
    return this;
  }
  sendTransactionAndGetResponse(txs: any[]) {
    // The real testbed stamps the current height onto each tx before sending.
    for (const tx of txs) tx.blockheight = 7;
    return [];
  }
}

describe("createRecorder", () => {
  it("records the contract source that was loaded", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().loadContract("#program name X");
    expect(recording.contractSource).toBe("#program name X");
  });

  it("records loader options", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().loadContract("src", { creator: 9n, initializers: { a: 1 } });
    expect(recording.creator).toBe(9n);
    expect(recording.initializers).toEqual({ a: 1 });
  });

  it("records transactions passed to the constructor", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded([{ blockheight: 1, amount: 5n, sender: 10n }]);
    expect(recording.transactions).toHaveLength(1);
    expect(recording.transactions[0].sender).toBe(10n);
  });

  it("records transactions passed to runScenario", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().runScenario([{ blockheight: 2, amount: 1n, sender: 20n }]);
    expect(recording.transactions[0].blockheight).toBe(2);
  });

  it("records the mutated blockheight from sendTransactionAndGetResponse", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().sendTransactionAndGetResponse([{ amount: 1n, sender: 30n }]);
    // Captured after the call, so it carries the height the testbed stamped on.
    expect(recording.transactions[0].blockheight).toBe(7);
  });

  it("keeps the underlying return values intact for chaining", () => {
    const { Recorded } = createRecorder(FakeTestbed as any);
    const instance = new Recorded();
    expect(instance.loadContract("x").runScenario()).toBe(instance);
  });

  it("records multiple contracts, last loaded is the active one", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().loadContract("first").loadContract("second");
    expect(recording.contractSource).toBe("second");
    expect(recording.allContractSources).toEqual(["first", "second"]);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/runner/recording.test.ts`
Expected: FAIL — cannot find module `./recording`

- [ ] **Step 3: Write the recorder**

Create `src/features/testbed/runner/recording.ts`:

```ts
export interface TestRecording {
  /** Source of the active (last-loaded) contract. */
  contractSource?: string;
  /** Every contract loaded, in order — a test may set up more than one. */
  allContractSources: string[];
  creator?: bigint;
  initializers?: Record<string, number | string | bigint>;
  /** Every transaction the test sent, in order, with effective blockheights. */
  transactions: Record<string, unknown>[];
}

type Constructable = new (...args: any[]) => any;

/**
 * Wraps `SimulatorTestbed` so a run can be replayed in the step debugger.
 *
 * Transactions are captured *after* each call, because
 * `sendTransactionAndGetResponse` stamps the current blockheight onto the
 * objects it is given — recording beforehand would save heights that are
 * still undefined.
 */
export function createRecorder(Testbed: Constructable) {
  const recording: TestRecording = { allContractSources: [], transactions: [] };

  const capture = (txs: unknown) => {
    if (!Array.isArray(txs)) return;
    for (const tx of txs) recording.transactions.push({ ...(tx as object) } as Record<string, unknown>);
  };

  class Recorded extends Testbed {
    constructor(...args: any[]) {
      super(...args);
      capture(args[0]);
    }

    loadContract(code: string, options?: { creator?: bigint; initializers?: Record<string, number | string | bigint> }) {
      recording.contractSource = code;
      recording.allContractSources.push(code);
      if (options?.creator !== undefined) recording.creator = options.creator;
      if (options?.initializers !== undefined) recording.initializers = options.initializers;
      return super.loadContract(code, options);
    }

    runScenario(txs?: unknown[]) {
      const result = super.runScenario(txs);
      capture(txs);
      return result;
    }

    sendTransactionAndGetResponse(txs: unknown[], address?: bigint) {
      const result = super.sendTransactionAndGetResponse(txs, address);
      capture(txs);
      return result;
    }
  }

  return { Recorded, recording };
}
```

- [ ] **Step 4: Use it in the runner**

In `src/features/testbed/runner/run-request.ts`, replace the plain testbed virtual module with a recorded one, and expose the recording. Change the virtuals block to:

```ts
    const { Recorded, recording } = createRecorder(testbedPkg.SimulatorTestbed as never);
    recordings[entry] = recording;

    const registry = createRegistry({
      modules: request.modules,
      rawFiles: request.rawFiles,
      virtuals: {
        vitest: api,
        "signum-smartc-testbed": { __esModule: true, ...testbedPkg, SimulatorTestbed: Recorded },
      },
    });
```

Add the import at the top of the file:

```ts
import { createRecorder, type TestRecording } from "./recording";
```

and declare the collector immediately before the `for (const entry of request.entryPaths)` loop:

```ts
  const recordings: Record<string, TestRecording> = {};
```

Emit them with the run so the client can offer a Debug button — extend the `run:end` event in `types.ts` (which now imports `TestRecording` from `./recording`; `recording.ts` imports nothing from `types.ts`, so there is no cycle):

```ts
  | { type: "run:end"; durationMs: number; recordings?: Record<string, TestRecording> }
```

and emit `{ type: "run:end", durationMs: Date.now() - started, recordings }`.

**Note:** the recording is per *file*, not per test. A file whose `beforeEach` builds a fresh testbed will record every test's transactions concatenated. That is a known limitation of this task — Task 10's Debug button therefore offers "debug this file's run", and per-test recording is a Plan 4 refinement. Do not try to solve it here.

- [ ] **Step 5: Verify**

Run: `bun test src/features/testbed/`
Expected: PASS, including the integration test — if it fails, the recorder's `super` calls are wrong, which is a real defect

- [ ] **Step 6: Commit**

```bash
git add src/features/testbed/runner/recording.ts src/features/testbed/runner/recording.test.ts src/features/testbed/runner/run-request.ts src/features/testbed/runner/types.ts
git commit -m "feat(studio): record contract and transactions during a run"
```

---

## Task 10: Recording → scenario

**Files:**
- Create: `src/features/testbed/to-debug-scenario.ts`
- Test: `src/features/testbed/to-debug-scenario.test.ts`

The testbed never pre-funds accounts, while `ScSimulatorEngine.submitScenario` does. A generated scenario must therefore fund each sender, or replay fails on a negative balance where the test succeeded.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/to-debug-scenario.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { toDebugScenario } from "./to-debug-scenario";
import type { TestRecording } from "./runner/recording";

const base = (over: Partial<TestRecording> = {}): TestRecording => ({
  allContractSources: ["#program name X"],
  contractSource: "#program name X",
  transactions: [],
  ...over,
});

describe("toDebugScenario", () => {
  it("maps a transaction to a scenario transaction", () => {
    const s = toDebugScenario(
      base({ transactions: [{ blockheight: 1, amount: 2_0000_0000n, sender: 10n }] }),
    );
    expect(s.transactions[0]).toMatchObject({ block: 1, sender: "10", amount: "200000000" });
  });

  it("defaults a missing blockheight to block 1", () => {
    const s = toDebugScenario(base({ transactions: [{ amount: 1n, sender: 10n }] }));
    expect(s.transactions[0].block).toBe(1);
  });

  it("carries messageText and messageHex", () => {
    const s = toDebugScenario(
      base({
        transactions: [
          { blockheight: 1, amount: 1n, sender: 10n, messageText: "hi" },
          { blockheight: 2, amount: 1n, sender: 10n, messageHex: "00ff" },
        ],
      }),
    );
    expect(s.transactions[0].message).toBe("hi");
    expect(s.transactions[1].messageHex).toBe("00ff");
  });

  it("funds each sender with its total outgoing plus headroom", () => {
    const s = toDebugScenario(
      base({
        transactions: [
          { blockheight: 1, amount: 5_0000_0000n, sender: 10n },
          { blockheight: 2, amount: 3_0000_0000n, sender: 10n },
        ],
      }),
    );
    // 8 SIGNA sent + 1 SIGNA headroom
    expect(s.accounts).toEqual([{ id: "10", balance: "900000000" }]);
  });

  it("funds each distinct sender separately", () => {
    const s = toDebugScenario(
      base({
        transactions: [
          { blockheight: 1, amount: 1_0000_0000n, sender: 10n },
          { blockheight: 1, amount: 2_0000_0000n, sender: 20n },
        ],
      }),
    );
    expect(s.accounts.map((a) => a.id).sort()).toEqual(["10", "20"]);
  });

  it("uses the recorded creator when there is one", () => {
    expect(toDebugScenario(base({ creator: 777n })).creator).toBe("777");
  });

  it("falls back to the testbed's default creator", () => {
    expect(toDebugScenario(base()).creator).toBe("555");
  });

  it("produces a version 2 scenario", () => {
    expect(toDebugScenario(base()).version).toBe(2);
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/to-debug-scenario.test.ts`
Expected: FAIL — cannot find module `./to-debug-scenario`

- [ ] **Step 3: Write the converter**

Create `src/features/testbed/to-debug-scenario.ts`:

```ts
import type { ScenarioFile, ScenarioTx } from "@/features/simulator/scenario/scenario.types";
import type { TestRecording } from "./runner/recording";

/** The testbed's default creator when a test does not name one. */
const DEFAULT_CREATOR = 555n;

/** Headroom above what a sender spends, so replay never fails on a rounding edge. */
const FUNDING_HEADROOM = 1_0000_0000n;

/**
 * Converts a recorded run into a scenario the step debugger can replay.
 *
 * The testbed never pre-funds accounts while the debugger's engine does, so
 * senders are funded here with what they spent plus headroom. Without it a test
 * that passed would fail on replay with a negative balance.
 */
export function toDebugScenario(recording: TestRecording): ScenarioFile {
  const spentBySender = new Map<string, bigint>();

  const transactions: ScenarioTx[] = recording.transactions.map((raw) => {
    const sender = String(raw.sender);
    const amount = BigInt((raw.amount as bigint | number | string) ?? 0);
    spentBySender.set(sender, (spentBySender.get(sender) ?? 0n) + amount);

    const tx: ScenarioTx = {
      block: Number(raw.blockheight ?? 1),
      sender,
      amount: amount.toString(),
    };
    if (raw.txid !== undefined) tx.txId = String(raw.txid);
    if (raw.messageText !== undefined) tx.message = String(raw.messageText);
    if (raw.messageHex !== undefined) tx.messageHex = String(raw.messageHex);
    return tx;
  });

  return {
    version: 2,
    creator: String(recording.creator ?? DEFAULT_CREATOR),
    accounts: [...spentBySender].map(([id, spent]) => ({
      id,
      balance: (spent + FUNDING_HEADROOM).toString(),
    })),
    transactions,
  };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test src/features/testbed/to-debug-scenario.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/to-debug-scenario.ts src/features/testbed/to-debug-scenario.test.ts
git commit -m "feat(studio): convert a recorded run into a debuggable scenario"
```

---

## Task 11: The Debug button

**Files:**
- Modify: `src/features/testbed/test-run-model.ts`
- Modify: `src/features/testbed/ui/test-results-panel.tsx`
- Modify: `src/features/testbed/ui/test-file-editor.tsx`

`DebugView` takes `{ source, scenarios: { name, json }[], onClose }` — the same component the SmartC editor uses, so no new debugger code is needed.

- [ ] **Step 1: Keep the recording in run state**

In `src/features/testbed/test-run-model.ts`, add to `RunState`:

```ts
  /** Present once a run finishes, keyed by test file — drives the Debug button. */
  recordings?: Record<string, TestRecording>;
```

and in the `run:end` case:

```ts
      return { ...state, status: "done", durationMs: event.durationMs, recordings: event.recordings };
```

Add a test alongside the existing `run:end` one asserting the recordings survive the fold.

- [ ] **Step 2: Offer the button**

In `src/features/testbed/ui/test-results-panel.tsx`, add an `onDebug?: () => void` prop and render a button in the summary bar when `state.recordings` has an entry:

```tsx
        {onDebug && state.recordings && Object.keys(state.recordings).length > 0 && (
          <button type="button" onClick={onDebug} className="ml-auto flex items-center gap-1 hover:underline">
            <Bug className="h-3.5 w-3.5" /> Debug
          </button>
        )}
```

importing `Bug` from `lucide-react`. If the duration is also rendered with `ml-auto`, put both in a right-aligned group so they do not fight.

- [ ] **Step 3: Mount the debugger**

In `src/features/testbed/ui/test-file-editor.tsx`:

```tsx
  const [debugging, setDebugging] = useState(false);

  const recording = state.recordings?.[file.metadata.path];

  // …in the JSX, replacing the panel group when debugging:
  if (debugging && recording?.contractSource) {
    return (
      <DebugView
        source={recording.contractSource}
        scenarios={[{ name: "from test run", json: serializeScenario(toDebugScenario(recording)) }]}
        onClose={() => setDebugging(false)}
      />
    );
  }
```

with imports:

```tsx
import { DebugView } from "@/features/simulator/ui/debug-view";
import { serializeScenario } from "@/features/simulator/scenario/scenario-io";
import { toDebugScenario } from "../to-debug-scenario";
```

and `onDebug={() => setDebugging(true)}` passed to the panel.

**Note the limitation to surface in the UI:** the replay reproduces the *transaction stream*, not the JS control flow — assertions do not re-evaluate while stepping. And when a test loads several contracts, only the active (last-loaded) one is steppable. Add a one-line note to that effect above the debugger, so the behaviour is stated rather than discovered.

- [ ] **Step 4: Verify**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -E "test-file-editor|test-results-panel|test-run-model" || echo "no errors in changed files"`
Expected: `no errors in changed files`

Run: `bun test src/features/testbed/` and `bun run build`
Expected: both pass

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/test-run-model.ts src/features/testbed/ui/test-results-panel.tsx src/features/testbed/ui/test-file-editor.tsx
git commit -m "feat(studio): debug a test run in the step debugger"
```

---

## Task 12: Debug runs on the main thread

**Files:**
- Create: `src/features/testbed/main-thread-transport.ts`
- Test: `src/features/testbed/main-thread-transport.test.ts`
- Modify: `src/features/testbed/use-test-run.ts`
- Modify: `src/features/testbed/ui/test-file-editor.tsx`

Breakpoints inside test code are not worth building a debug adapter for — the browser already has a debugger. The registry already appends `//# sourceURL=<path>`, so evaluated modules appear in DevTools Sources under their real names. The only missing piece is running them in the page rather than in a worker, where DevTools cannot reach them.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/main-thread-transport.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createMainThreadTransport } from "./main-thread-transport";
import type { TestEvent } from "./runner/types";

const request = {
  modules: {
    "/proj/a.test.ts": {
      js: `const v = require("vitest"); v.it("t", () => { v.expect(1n).toBe(1n); });`,
    },
  },
  rawFiles: {},
  entryPaths: ["/proj/a.test.ts"],
};

describe("createMainThreadTransport", () => {
  it("runs the request in-process and emits events", async () => {
    const transport = createMainThreadTransport();
    const events: TestEvent[] = [];
    const done = new Promise<void>((resolve) => {
      transport.onEvent((event) => {
        events.push(event);
        if (event.type === "run:end") resolve();
      });
    });

    transport.post(request as never);
    await done;

    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.status).toBe("passed");
  });

  it("has a terminate that is safe to call", () => {
    const transport = createMainThreadTransport();
    expect(() => transport.terminate()).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and watch it fail**

Run: `bun test src/features/testbed/main-thread-transport.test.ts`
Expected: FAIL — cannot find module `./main-thread-transport`

- [ ] **Step 3: Write the transport**

Create `src/features/testbed/main-thread-transport.ts`:

```ts
import { runRequest } from "./runner/run-request";
import type { RunnerTransport } from "./runner-client";
import type { RunRequest, TestEvent } from "./runner/types";

/**
 * Runs tests in the page instead of a worker, so the browser's own debugger can
 * reach them: `debugger;` statements break, and the `//# sourceURL` the module
 * registry appends makes each file appear in DevTools Sources under its real path.
 *
 * The trade-off is real and the reason this is not the default — a contract that
 * loops forever freezes the tab, and the watchdog cannot rescue it, because the
 * timer it depends on is blocked by the very loop it would interrupt.
 */
export function createMainThreadTransport(): RunnerTransport {
  let listener: (event: TestEvent) => void = () => {};

  return {
    post: (request: RunRequest) => {
      void runRequest(request, (event) => listener(event));
    },
    onEvent: (l) => {
      listener = l;
    },
    terminate: () => {
      // Nothing to tear down: the run owns the main thread until it finishes.
    },
  };
}
```

- [ ] **Step 4: Run the test**

Run: `bun test src/features/testbed/main-thread-transport.test.ts`
Expected: PASS, 2 tests

- [ ] **Step 5: Offer it from the hook**

In `src/features/testbed/use-test-run.ts`, widen `run` with a debug flag:

```ts
  run: (monaco: typeof Monaco, projectFolderId: string, entryPath?: string, debug?: boolean) => Promise<void>;
```

and inside, choose the transport and the watchdog budget:

```ts
        await runTests(
          { modules, rawFiles: snapshot.rawFiles, entryPaths },
          debug ? createMainThreadTransport() : createWorkerTransport(),
          // A debug run is paused at a breakpoint for as long as the user needs,
          // so the no-progress watchdog must not fire. It cannot be disabled with
          // Infinity — browsers clamp that to ~1ms — hence a long finite budget.
          debug ? { noProgressTimeoutMs: 60 * 60 * 1000 } : undefined,
        );
```

adjusting for the fact that `runTests` takes `emit` before `options` — keep the existing emit callback in place and pass options as the fourth argument.

Add the import: `import { createMainThreadTransport } from "./main-thread-transport";`

- [ ] **Step 6: Add the toggle**

In `src/features/testbed/ui/test-file-editor.tsx`, add a checkbox or small toggle beside the results summary labelled "Debug run (DevTools)", holding `const [debugRun, setDebugRun] = useState(false);`, and pass it through: `await run(monaco, projectId, file.metadata.path, debugRun);`

Add a one-line hint next to it explaining what it does and its cost — something like "runs in the page so DevTools can break; a runaway contract will freeze the tab".

- [ ] **Step 7: Verify**

Run: `bun test src/features/testbed/`
Expected: PASS

Run: `bun run build`
Expected: succeeds

- [ ] **Step 8: Commit**

```bash
git add src/features/testbed/main-thread-transport.ts src/features/testbed/main-thread-transport.test.ts src/features/testbed/use-test-run.ts src/features/testbed/ui/test-file-editor.tsx
git commit -m "feat(studio): run tests on the main thread for DevTools debugging"
```

---

## Part B verification (manual, in a browser)

1. Run a test file that loads a contract and sends transactions
2. Press **Debug** — the step debugger opens with the contract source
3. Step through and confirm the transactions from the test are present at the right blocks
4. Confirm a test using `asHexMessage` replays with its payload intact
5. Close the debugger and confirm the editor and results return
6. Tick **Debug run**, put a `debugger;` statement in a test, open DevTools and Run — execution should break inside your test file, shown under its real path in Sources

---

## Done criteria

- Every test shows a gutter marker at its own `it()`, coloured by status
- Clicking a result scrolls to its line; clicking a failure scrolls to the failing assertion
- Skipped tests appear with their real names
- A finished run offers Debug, which opens the step debugger on the recorded transactions
- `bun test` passes; `bun run build` succeeds

## What comes next (Plan 4)

- The session→test generator with the pin-expectations dialog
- Per-test recordings, so Debug targets one test rather than a file's whole run
- Generated `.d.ts` from the installed packages, replacing the hand-written facade
- Run-all-files across a project, and click-to-run a single test from the gutter
