# Browser Test Runner UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the test runner usable — open a `.test.ts` file in Studio, write a test against a contract, press Run, and see pass/fail with real failure diffs.

**Architecture:** Monaco's TypeScript worker transpiles the project's `.ts` files to CommonJS in the browser. A snapshot of the project's virtual filesystem plus those transpiled modules becomes a `RunRequest`, which `runTests` (Plan 1) executes in a Web Worker. Events stream back through a pure reducer into a results panel beside the editor.

**Tech Stack:** React 19, Monaco (`@monaco-editor/react`, CDN-loaded), Bun, jotai, the Plan 1 runner.

**Spec:** `docs/superpowers/specs/2026-08-22-browser-test-runner-design.md` (phases 4–6)
**Builds on:** `docs/superpowers/plans/2026-08-22-browser-test-runner-core.md` — complete, 70 tests passing.

**Working directory:** All commands run from `apps/studio/`.

---

## Scope

**In:** `.test.ts` as a file type, a TypeScript editor, in-browser transpilation, a Run action, a results panel with failure diffs and console output.

**Out, deferred to Plan 3:** gutter decorations per `it()`, sourcemap stack→line navigation, generated `.d.ts` from the installed packages (this plan ships a hand-written facade instead — see Task 4), the session→test generator, and the debugger handoff.

**Why this split:** the value is in closing the write→run→see-result loop. Gutter icons and stack mapping are polish on a loop that must exist first, and both depend on sourcemap plumbing that would otherwise gate the whole plan.

---

## The keystone risk

Everything here rests on one unproven assumption: **that Monaco's bundled TypeScript worker will transpile our files to usable CommonJS in this app.** It is loaded from CDN by `@monaco-editor/react`, and no code in this repo has ever asked it for emit output. If `getEmitOutput` does not work as expected, the whole plan needs a different transpiler (esbuild-wasm) and the task breakdown changes.

Task 1 therefore proves that in a browser before anything is built on top of it, and it is the only task with a manual verification step that cannot be skipped.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/features/testbed/transpile.ts` | Monaco TS worker → `{ js, sourceMap }` per file. Deliberately logic-free |
| `src/features/testbed/monaco-setup.ts` | TypeScript compiler options and ambient typings for the editor |
| `src/features/testbed/typings/ambient.ts` | Hand-written `.d.ts` text for `vitest`, `signum-smartc-testbed`, `*?raw` |
| `src/features/testbed/project-snapshot.ts` | Project subtree → `{ tsFiles, rawFiles }`, split by extension |
| `src/features/testbed/test-run-model.ts` | Pure reducer: `TestEvent` stream → renderable run state |
| `src/features/testbed/use-test-run.ts` | Hook wiring snapshot → transpile → `runTests` → reducer |
| `src/features/testbed/test-starter.ts` | Starter content for a new `.test.ts` |
| `src/features/testbed/ui/test-file-editor.tsx` | Monaco editor + results panel, Run action |
| `src/features/testbed/ui/test-results-panel.tsx` | Suite/test rows, failure detail, console output |
| `src/features/project/filetype-icons.tsx` | *(modify)* accept `.ts` / `.test.ts` |
| `src/features/project/new-file-dialog.tsx` | *(modify)* offer the Test type |
| `src/pages/files/files-page.tsx` | *(modify)* route `FileTypes.Test` |

---

## Task 1: Prove Monaco can transpile (keystone)

**Files:**
- Create: `src/features/testbed/transpile.ts`
- Create: `src/features/testbed/dev-transpile-probe.ts` (temporary, deleted in Task 9)

There is no automated test here: Monaco needs a real browser and a CDN load. The verification is manual and mandatory. Do not proceed to Task 2 until you have seen the expected console output with your own eyes.

- [ ] **Step 1: Write the transpiler**

Create `src/features/testbed/transpile.ts`:

```ts
import type * as Monaco from "monaco-editor";
import type { CompiledModule } from "./runner/types";

/**
 * Transpiles project TypeScript to CommonJS using Monaco's own TypeScript
 * worker — the same one already powering the editor, so no second toolchain
 * and no extra bytes.
 *
 * Deliberately logic-free: it cannot be unit-tested without a browser, so
 * anything with decisions in it belongs in project-snapshot.ts or test-run-model.ts.
 *
 * `files` maps file system paths (`/proj/tests/a.test.ts`) to source text. The returned
 * record is keyed by the same paths, ready to drop into a RunRequest.
 */
export async function transpileAll(
  monaco: typeof Monaco,
  files: Record<string, string>,
): Promise<Record<string, CompiledModule>> {
  const uris: Monaco.Uri[] = [];

  for (const [path, content] of Object.entries(files)) {
    // `file://` + the absolute file system path, so uri.path round-trips to the key.
    const uri = monaco.Uri.parse("file://" + path);
    const existing = monaco.editor.getModel(uri);
    if (existing) {
      if (existing.getValue() !== content) existing.setValue(content);
    } else {
      monaco.editor.createModel(content, "typescript", uri);
    }
    uris.push(uri);
  }

  const getWorker = await monaco.languages.typescript.getTypeScriptWorker();
  const out: Record<string, CompiledModule> = {};

  for (const uri of uris) {
    const client = await getWorker(uri);
    const emitted = await client.getEmitOutput(uri.toString());
    const js = emitted.outputFiles.find((f: { name: string }) => f.name.endsWith(".js"));
    const map = emitted.outputFiles.find((f: { name: string }) => f.name.endsWith(".js.map"));
    if (js) out[uri.path] = { js: js.text, sourceMap: map?.text };
  }

  return out;
}
```

- [ ] **Step 2: Write a temporary probe**

Create `src/features/testbed/dev-transpile-probe.ts`:

```ts
import type * as Monaco from "monaco-editor";
import { transpileAll } from "./transpile";
import { runRequest } from "./runner/run-request";
import type { TestEvent } from "./runner/types";

/**
 * TEMPORARY probe proving Monaco transpiles to runnable CommonJS.
 * Deleted in Task 9. Call from the browser console: `__probeTranspile()`.
 */
export function installTranspileProbe(monaco: typeof Monaco) {
  (globalThis as any).__probeTranspile = async () => {
    const modules = await transpileAll(monaco, {
      "/probe/scenarios.ts": `export const Answer = 42n;`,
      "/probe/a.test.ts": `
import { describe, it, expect } from "vitest";
import { Answer } from "./scenarios";
describe("probe", () => {
  it("links a relative import and compares bigints", () => {
    expect(Answer).toBe(42n);
  });
});`,
    });

    console.log("EMITTED JS:\n", modules["/probe/a.test.ts"]?.js);
    console.log("HAS SOURCEMAP:", Boolean(modules["/probe/a.test.ts"]?.sourceMap));

    const events: TestEvent[] = [];
    await runRequest(
      { modules, rawFiles: {}, entryPaths: ["/probe/a.test.ts"] },
      (e) => events.push(e),
    );
    console.log("EVENTS:", events);
    return events;
  };
}
```

- [ ] **Step 3: Install the probe temporarily**

In `src/features/smartc-editor/smartc-editor.tsx`, find the `onMount` handler (it receives `(editor, monaco)`) and add as its first line:

```ts
    installTranspileProbe(monaco);
```

with the matching import at the top:

```ts
import { installTranspileProbe } from "@/features/testbed/dev-transpile-probe";
```

This is temporary scaffolding; Task 9 removes both lines.

- [ ] **Step 4: Verify in a real browser — MANDATORY**

Run `bun dev`, open the app, open any `.smart.c` file so Monaco mounts, then in the browser console run:

```js
await __probeTranspile()
```

Expected, and check each one:
1. `EMITTED JS` shows CommonJS — `require("vitest")`, `exports.` assignments, **not** `import` statements
2. `HAS SOURCEMAP: true`
3. `EVENTS` contains a `test:end` with `status: "passed"`

Paste the actual console output into your report.

**If `getEmitOutput` returns no `.js` file, or the emit is still ESM, STOP.** Do not work around it, do not proceed to Task 2. Report exactly what came back — that finding invalidates the plan's transpiler choice and I need to decide between esbuild-wasm and another approach.

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/transpile.ts src/features/testbed/dev-transpile-probe.ts src/features/smartc-editor/smartc-editor.tsx
git commit -m "feat(studio): transpile project TypeScript with Monaco's TS worker"
```

---

## Task 2: Project snapshot

**Files:**
- Create: `src/features/testbed/project-snapshot.ts`
- Test: `src/features/testbed/project-snapshot.test.ts`

A run needs every `.ts` in the project (tests plus helpers) and every `.smart.c` (for `?raw` imports). `FileSystem.listFilesRecursive(folderId)` already returns the subtree, so this module only decides which files matter and reads them.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/project-snapshot.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { snapshotProject, isTestEntry, type SnapshotSource } from "./project-snapshot";

/**
 * Stands in for FileSystem. The real class reads `localStorage` when its module
 * loads, so tests supply just the two methods `snapshotProject` calls.
 */
function fakeFs(files: { id: string; path: string }[], contents: Record<string, string>): SnapshotSource {
  return {
    listFilesRecursive: () => files.map((f) => ({ id: f.id, path: f.path })),
    loadFile: async (fileId: string) => ({ content: contents[fileId] }),
  } as unknown as SnapshotSource;
}

describe("snapshotProject", () => {
  it("splits .ts sources from .smart.c contract sources", async () => {
    const fs = fakeFs(
      [
        { id: "c1", path: "/proj/counter.smart.c" },
        { id: "t1", path: "/proj/tests/counter.test.ts" },
        { id: "h1", path: "/proj/tests/context.ts" },
      ],
      { c1: "#program name Counter", t1: "// test", h1: "// helper" },
    );

    const snap = await snapshotProject(fs, "proj");

    expect(snap.tsFiles).toEqual({
      "/proj/tests/counter.test.ts": "// test",
      "/proj/tests/context.ts": "// helper",
    });
    expect(snap.rawFiles).toEqual({ "/proj/counter.smart.c": "#program name Counter" });
  });

  it("ignores file types the runner has no use for", async () => {
    const fs = fakeFs(
      [
        { id: "s", path: "/proj/x.scenario.json" },
        { id: "a", path: "/proj/x.asm" },
        { id: "t", path: "/proj/x.test.ts" },
      ],
      { s: "{}", a: "SET @a", t: "// test" },
    );
    const snap = await snapshotProject(fs, "proj");
    expect(Object.keys(snap.tsFiles)).toEqual(["/proj/x.test.ts"]);
    expect(snap.rawFiles).toEqual({});
  });

  it("scopes the snapshot to the project folder it is given", async () => {
    const calls: (string | undefined)[] = [];
    const fs = {
      listFilesRecursive: (folderId?: string) => {
        calls.push(folderId);
        return [];
      },
      loadFile: async () => ({ content: "" }),
    } as unknown as SnapshotSource;

    await snapshotProject(fs, "demo");
    expect(calls).toEqual(["demo"]);
  });

  it("returns empty maps for an empty project", async () => {
    const snap = await snapshotProject(fakeFs([], {}), "proj");
    expect(snap.tsFiles).toEqual({});
    expect(snap.rawFiles).toEqual({});
  });

  it("treats a file with no content as empty rather than failing", async () => {
    const fs = fakeFs([{ id: "t", path: "/proj/x.test.ts" }], {});
    const snap = await snapshotProject(fs, "proj");
    expect(snap.tsFiles["/proj/x.test.ts"]).toBe("");
  });

  it("treats only .test.ts files as run entries", () => {
    expect(isTestEntry("/proj/tests/counter.test.ts")).toBe(true);
    expect(isTestEntry("/proj/tests/context.ts")).toBe(false);
    expect(isTestEntry("/proj/counter.smart.c")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/project-snapshot.test.ts`
Expected: FAIL — cannot find module `./project-snapshot`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/project-snapshot.ts`:

```ts
import type { FileSystem } from "@/lib/file-system";

/**
 * The slice of FileSystem this module needs.
 *
 * A `Pick` over the real class rather than a hand-written interface, so the two
 * cannot drift. The import is type-only on purpose: `file-system.ts` builds its
 * singleton at module load and touches `localStorage`, which throws under
 * `bun test` — an erased import keeps this module testable without a DOM.
 */
export type SnapshotSource = Pick<FileSystem, "listFilesRecursive" | "loadFile">;

export interface ProjectSnapshot {
  /** File system path → TypeScript source, awaiting transpilation. */
  tsFiles: Record<string, string>;
  /** File system path → contract source, served to `?raw` imports. */
  rawFiles: Record<string, string>;
}

/** Only `*.test.ts` files are run; other `.ts` files are helpers they import. */
export function isTestEntry(path: string): boolean {
  return path.endsWith(".test.ts");
}

/**
 * Reads everything in a project the runner can use, split by kind.
 *
 * Contents are read eagerly: projects are small, and a run should see one
 * consistent snapshot rather than files shifting underneath it mid-run.
 */
export async function snapshotProject(
  fs: SnapshotSource,
  projectFolderId: string,
): Promise<ProjectSnapshot> {
  const tsFiles: Record<string, string> = {};
  const rawFiles: Record<string, string> = {};

  for (const metadata of fs.listFilesRecursive(projectFolderId)) {
    const path = metadata.path;
    const target = path.endsWith(".ts") ? tsFiles : path.endsWith(".smart.c") ? rawFiles : null;
    if (!target) continue;
    const loaded = await fs.loadFile(metadata.id);
    target[path] = String(loaded.content ?? "");
  }

  return { tsFiles, rawFiles };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/project-snapshot.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/project-snapshot.ts src/features/testbed/project-snapshot.test.ts
git commit -m "feat(studio): snapshot a project's sources for a test run"
```

---

## Task 3: Run state reducer

**Files:**
- Create: `src/features/testbed/test-run-model.ts`
- Test: `src/features/testbed/test-run-model.test.ts`

The UI renders from a plain data structure, folded from the event stream. Keeping this pure means the panel has no logic worth testing.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/test-run-model.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { initialRunState, reduceEvent, type RunState } from "./test-run-model";
import type { TestEvent } from "./runner/types";

const fold = (events: TestEvent[]): RunState => events.reduce(reduceEvent, initialRunState());

const started: TestEvent = {
  type: "test:start",
  id: "a#0",
  name: "works",
  path: ["suite", "works"],
  file: "/a.test.ts",
};

describe("test-run-model", () => {
  it("starts idle and empty", () => {
    const s = initialRunState();
    expect(s.status).toBe("idle");
    expect(s.rows).toEqual([]);
  });

  it("adds a running row on test:start", () => {
    const s = fold([started]);
    expect(s.status).toBe("running");
    expect(s.rows[0]).toMatchObject({ id: "a#0", name: "works", status: "running" });
  });

  it("completes the row on test:end", () => {
    const s = fold([started, { type: "test:end", id: "a#0", status: "passed", durationMs: 7 }]);
    expect(s.rows[0]).toMatchObject({ status: "passed", durationMs: 7 });
    expect(s.counts.passed).toBe(1);
  });

  it("records a failure with its diff payload", () => {
    const s = fold([
      started,
      {
        type: "test:end",
        id: "a#0",
        status: "failed",
        durationMs: 3,
        failure: { message: "expected 2n to be 99n", expected: 99n, actual: 2n },
      },
    ]);
    expect(s.rows[0].failure?.expected).toBe(99n);
    expect(s.counts.failed).toBe(1);
  });

  it("creates a row for a skipped test that never started", () => {
    const s = fold([{ type: "test:end", id: "a#1", status: "skipped", durationMs: 0 }]);
    expect(s.rows[0]).toMatchObject({ id: "a#1", status: "skipped" });
    expect(s.counts.skipped).toBe(1);
  });

  it("attaches console output to the test that produced it", () => {
    const s = fold([
      started,
      { type: "console", testId: "a#0", level: "log", text: "hello" },
      { type: "test:end", id: "a#0", status: "passed", durationMs: 1 },
    ]);
    expect(s.rows[0].logs).toEqual([{ level: "log", text: "hello" }]);
  });

  it("keeps console output with no test as run-level output", () => {
    const s = fold([{ type: "console", testId: null, level: "warn", text: "at import time" }]);
    expect(s.logs).toEqual([{ level: "warn", text: "at import time" }]);
  });

  it("records collection errors per file", () => {
    const s = fold([{ type: "collect:error", file: "/a.test.ts", message: "boom" }]);
    expect(s.collectErrors).toEqual([{ file: "/a.test.ts", message: "boom" }]);
  });

  it("records hook errors", () => {
    const s = fold([
      {
        type: "hook:error",
        file: "/a.test.ts",
        suite: ["outer"],
        phase: "afterAll",
        message: "cleanup blew up",
      },
    ]);
    expect(s.hookErrors[0]).toMatchObject({ phase: "afterAll", message: "cleanup blew up" });
  });

  it("finishes on run:end", () => {
    const s = fold([started, { type: "test:end", id: "a#0", status: "passed", durationMs: 1 }, { type: "run:end", durationMs: 12 }]);
    expect(s.status).toBe("done");
    expect(s.durationMs).toBe(12);
  });

  it("counts a timeout as its own outcome", () => {
    const s = fold([started, { type: "test:end", id: "a#0", status: "timedout", durationMs: 5000 }]);
    expect(s.counts.timedout).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/test-run-model.test.ts`
Expected: FAIL — cannot find module `./test-run-model`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/test-run-model.ts`:

```ts
import type { ConsoleLevel, TestEvent, TestFailure, TestStatus } from "./runner/types";

export interface LogLine {
  level: ConsoleLevel;
  text: string;
}

export interface TestRow {
  id: string;
  name: string;
  path: string[];
  file: string;
  status: TestStatus | "running";
  durationMs?: number;
  failure?: TestFailure;
  logs: LogLine[];
}

export interface RunState {
  status: "idle" | "running" | "done";
  rows: TestRow[];
  /** Row index by test id, so folding stays O(1) per event. */
  index: Record<string, number>;
  /** Output emitted outside any test — during collection or hooks. */
  logs: LogLine[];
  collectErrors: { file: string; message: string }[];
  hookErrors: { file: string; suite: string[]; phase: string; message: string }[];
  counts: Record<"passed" | "failed" | "skipped" | "todo" | "timedout", number>;
  durationMs?: number;
}

export function initialRunState(): RunState {
  return {
    status: "idle",
    rows: [],
    index: {},
    logs: [],
    collectErrors: [],
    hookErrors: [],
    counts: { passed: 0, failed: 0, skipped: 0, todo: 0, timedout: 0 },
  };
}

/**
 * Folds one event into the run state.
 *
 * Skipped and todo tests emit `test:end` with no preceding `test:start`, so a
 * row may have to be created here with only an id to identify it.
 */
export function reduceEvent(state: RunState, event: TestEvent): RunState {
  switch (event.type) {
    case "test:start": {
      const rows = [
        ...state.rows,
        {
          id: event.id,
          name: event.name,
          path: event.path,
          file: event.file,
          status: "running" as const,
          logs: [],
        },
      ];
      return {
        ...state,
        status: "running",
        rows,
        index: { ...state.index, [event.id]: rows.length - 1 },
      };
    }

    case "test:end": {
      const rows = [...state.rows];
      let at = state.index[event.id];
      let index = state.index;

      if (at === undefined) {
        // Skipped/todo tests never start, so the row appears for the first time here.
        rows.push({
          id: event.id,
          name: event.id.split("#")[0] ?? event.id,
          path: [],
          file: event.id.split("#")[0] ?? "",
          status: event.status,
          logs: [],
        });
        at = rows.length - 1;
        index = { ...index, [event.id]: at };
      }

      rows[at] = {
        ...rows[at],
        status: event.status,
        durationMs: event.durationMs,
        failure: event.failure,
      };

      return {
        ...state,
        status: "running",
        rows,
        index,
        counts: { ...state.counts, [event.status]: state.counts[event.status] + 1 },
      };
    }

    case "console": {
      const line = { level: event.level, text: event.text };
      if (event.testId === null) return { ...state, logs: [...state.logs, line] };
      const at = state.index[event.testId];
      if (at === undefined) return { ...state, logs: [...state.logs, line] };
      const rows = [...state.rows];
      rows[at] = { ...rows[at], logs: [...rows[at].logs, line] };
      return { ...state, rows };
    }

    case "collect:error":
      return {
        ...state,
        collectErrors: [...state.collectErrors, { file: event.file, message: event.message }],
      };

    case "hook:error":
      return {
        ...state,
        hookErrors: [
          ...state.hookErrors,
          { file: event.file, suite: event.suite, phase: event.phase, message: event.message },
        ],
      };

    case "run:end":
      return { ...state, status: "done", durationMs: event.durationMs };
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/test-run-model.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/test-run-model.ts src/features/testbed/test-run-model.test.ts
git commit -m "feat(studio): fold runner events into renderable state"
```

---

## Task 4: Ambient typings for the editor

**Files:**
- Create: `src/features/testbed/typings/ambient.ts`
- Create: `src/features/testbed/monaco-setup.ts`
- Test: `src/features/testbed/typings/ambient.test.ts`

Without ambient declarations, every import in a test file gets a red squiggle and the editor looks broken. Monaco has no filesystem and cannot read `node_modules`, so the declarations must be supplied as strings.

**A deliberate compromise:** the spec calls for generating these from the installed packages' real `.d.ts`. Flattening a multi-file `.d.ts` into one ambient module is the fiddliest part of that design, and it is not on the critical path for closing the write→run loop. This plan hand-writes a facade covering the surface people actually use, guarded by a test that fails when the installed testbed version changes — so drift gets noticed rather than silently accumulating. Generating the real thing is a Plan 3 task.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/typings/ambient.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { AMBIENT_TYPINGS, TYPED_TESTBED_VERSION } from "./ambient";
import pkg from "../../../../package.json";

describe("ambient typings", () => {
  it("declares the three modules a test file imports", () => {
    const all = AMBIENT_TYPINGS.map((t) => t.content).join("\n");
    expect(all).toContain('declare module "vitest"');
    expect(all).toContain('declare module "signum-smartc-testbed"');
    expect(all).toContain('declare module "*?raw"');
  });

  it("gives every lib a distinct file path, as addExtraLib requires", () => {
    const paths = AMBIENT_TYPINGS.map((t) => t.filePath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("covers the testbed methods the starter template uses", () => {
    const all = AMBIENT_TYPINGS.map((t) => t.content).join("\n");
    for (const method of [
      "loadContract",
      "runScenario",
      "getContractMemoryValue",
      "getContractMapValue",
      "sendTransactionAndGetResponse",
    ]) {
      expect(all).toContain(method);
    }
  });

  it("is pinned to the installed testbed version so drift is caught", () => {
    const installed = pkg.dependencies["signum-smartc-testbed"].replace(/^[\^~]/, "");
    expect(TYPED_TESTBED_VERSION).toBe(installed);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/typings/ambient.test.ts`
Expected: FAIL — cannot find module `./ambient`

- [ ] **Step 3: Write the typings**

Create `src/features/testbed/typings/ambient.ts`:

```ts
/**
 * Type declarations handed to Monaco so a test file type-checks in the editor.
 *
 * Monaco has no filesystem and cannot read node_modules, so these are strings.
 * They are a hand-written facade over the real packages, not generated from
 * them — see the plan for why. `TYPED_TESTBED_VERSION` is checked against the
 * installed dependency by a test, so a version bump surfaces as a failure
 * rather than as silently stale autocomplete.
 */
export const TYPED_TESTBED_VERSION = "1.2.0";

export interface AmbientLib {
  filePath: string;
  content: string;
}

const VITEST = `
declare module "vitest" {
  export interface Assertion<T = any> {
    toBe(expected: T): void;
    toEqual(expected: T): void;
    toStrictEqual(expected: T): void;
    toBeDefined(): void;
    toBeUndefined(): void;
    toBeNull(): void;
    toBeTruthy(): void;
    toBeFalsy(): void;
    toBeGreaterThan(n: number | bigint): void;
    toBeLessThan(n: number | bigint): void;
    toContain(item: any): void;
    toHaveLength(n: number): void;
    toMatchObject(shape: object): void;
    toThrow(expected?: string | RegExp): void;
    readonly not: Assertion<T>;
  }
  export function expect<T>(actual: T): Assertion<T>;
  export function describe(name: string, fn: () => void): void;
  export namespace describe {
    function skip(name: string, fn: () => void): void;
    function only(name: string, fn: () => void): void;
  }
  export function it(name: string, fn: () => unknown): void;
  export namespace it {
    function skip(name: string, fn: () => unknown): void;
    function only(name: string, fn: () => unknown): void;
    function todo(name: string): void;
  }
  export const test: typeof it;
  export function beforeAll(fn: () => unknown): void;
  export function afterAll(fn: () => unknown): void;
  export function beforeEach(fn: () => unknown): void;
  export function afterEach(fn: () => unknown): void;
}
`;

const TESTBED = `
declare module "signum-smartc-testbed" {
  export interface TransactionObj {
    blockheight?: number;
    amount: bigint;
    sender: bigint;
    recipient?: bigint;
    txid?: bigint;
    messageText?: string;
    messageHex?: string;
  }
  export interface BlockchainTransactionObj {
    txid: bigint;
    blockheight: number;
    amount: bigint;
    sender: bigint;
    recipient: bigint;
    messageText?: string;
    messageHex?: string;
  }
  export interface MapObj { k1: bigint; k2: bigint; value: bigint }
  export interface MemoryObj { varName: string; value: bigint }
  export interface AccountObj { id: bigint; balance: bigint }

  export interface LoadContractOptions {
    creator?: bigint;
    contractId?: bigint;
    initializers?: Record<string, number | string | bigint>;
  }

  export class SimulatorTestbed {
    constructor(scenario?: TransactionObj[]);
    /** Loads contract SOURCE (not a path) and makes it the active contract. */
    loadContract(code: string, options?: LoadContractOptions): this;
    selectContract(address: bigint): this;
    runScenario(scenario?: TransactionObj[]): this;
    getContractMemory(address?: bigint): MemoryObj[];
    getContractMemoryValue(name: string, address?: bigint): bigint | null;
    getContractMap(address?: bigint): MapObj[];
    getContractMapValue(key1: bigint, key2: bigint, address?: bigint): bigint;
    getContractMapValues(key1: bigint, address?: bigint): MapObj[];
    getAccount(accountId: bigint): AccountObj | null;
    getTransactions(): BlockchainTransactionObj[];
    getTransaction(index: number): BlockchainTransactionObj;
    getTransactionById(id: bigint): BlockchainTransactionObj | null;
    getTransactionsSentByContract(blockheight: number, address?: bigint): BlockchainTransactionObj[];
    sendTransactionAndGetResponse(transactions: TransactionObj[], address?: bigint): BlockchainTransactionObj[];
  }

  /** Encodes bigints as a hex message payload for a contract call. */
  export function asHexMessage(args: bigint[]): string;
}
`;

const RAW_IMPORTS = `
declare module "*?raw" {
  const content: string;
  export default content;
}
`;

export const AMBIENT_TYPINGS: AmbientLib[] = [
  { filePath: "file:///node_modules/@types/vitest/index.d.ts", content: VITEST },
  { filePath: "file:///node_modules/@types/signum-smartc-testbed/index.d.ts", content: TESTBED },
  { filePath: "file:///node_modules/@types/raw-imports/index.d.ts", content: RAW_IMPORTS },
];
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/typings/ambient.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Write the Monaco setup**

Create `src/features/testbed/monaco-setup.ts`:

```ts
import type * as Monaco from "monaco-editor";
import { AMBIENT_TYPINGS } from "./typings/ambient";

/**
 * Configures Monaco's TypeScript service for test files.
 *
 * `module: CommonJS` matters beyond the editor: the same settings drive
 * `getEmitOutput`, and the runner's module registry evaluates CommonJS.
 *
 * Idempotent — `setExtraLibs` replaces rather than appends, so remounting an
 * editor cannot stack duplicate declarations.
 */
export function configureTypeScriptForTests(monaco: typeof Monaco): void {
  const ts = monaco.languages.typescript;

  ts.typescriptDefaults.setCompilerOptions({
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.CommonJS,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    esModuleInterop: true,
    allowNonTsExtensions: true,
    skipLibCheck: true,
    sourceMap: true,
    strict: false,
    lib: ["es2020"],
  });

  ts.typescriptDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
  });

  ts.typescriptDefaults.setExtraLibs(AMBIENT_TYPINGS);
}
```

- [ ] **Step 6: Commit**

```bash
git add src/features/testbed/typings/ambient.ts src/features/testbed/typings/ambient.test.ts src/features/testbed/monaco-setup.ts
git commit -m "feat(studio): ambient typings and TS config for test files"
```

---

## Task 5: File type wiring and starter template

**Files:**
- Create: `src/features/testbed/test-starter.ts`
- Test: `src/features/testbed/test-starter.test.ts`
- Modify: `src/features/project/filetype-icons.tsx`
- Modify: `src/features/project/new-file-dialog.tsx`

`FileTypes.Test` already exists in the enum with an icon, but nothing produces it.

Note on extensions: `.test.ts` files are run entries; plain `.ts` files are helpers (`context.ts`, `scenarios.ts`) reachable by relative import. Both map to `FileTypes.Test` — one file type, one editor. Which files actually run is decided by `isTestEntry`, not by the type.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/test-starter.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { testStarter } from "./test-starter";
import { acceptedFileType, FileTypes } from "@/features/project/filetype-icons";

describe("testStarter", () => {
  it("imports the named contract with a ?raw import", () => {
    expect(testStarter("counter.test.ts", "counter.smart.c")).toContain(
      'import ContractCode from "../counter.smart.c?raw"',
    );
  });

  it("names the suite after the contract", () => {
    expect(testStarter("counter.test.ts", "counter.smart.c")).toContain('describe("counter"');
  });

  it("still produces a runnable file when no contract sits beside it", () => {
    const src = testStarter("empty.test.ts", null);
    expect(src).toContain('import { describe, it, expect } from "vitest"');
    // No executable contract import, but the user is shown the form it takes.
    // Line-anchored: the commented example necessarily contains the same words.
    expect(src).not.toMatch(/^import ContractCode/m);
    expect(src).toContain("// import ContractCode from");
  });
});

describe("acceptedFileType", () => {
  it("accepts .test.ts and .ts as Test files", () => {
    expect(acceptedFileType("counter.test.ts")).toBe(FileTypes.Test);
    expect(acceptedFileType("context.ts")).toBe(FileTypes.Test);
  });

  it("still accepts the existing types", () => {
    expect(acceptedFileType("a.smart.c")).toBe(FileTypes.SmartC);
    expect(acceptedFileType("a.scenario.json")).toBe(FileTypes.Scenario);
    expect(acceptedFileType("a.asm")).toBe(FileTypes.ASM);
  });

  it("rejects unknown extensions", () => {
    expect(acceptedFileType("notes.md")).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/test-starter.test.ts`
Expected: FAIL — cannot find module `./test-starter`

- [ ] **Step 3: Write the starter**

Create `src/features/testbed/test-starter.ts`:

```ts
/**
 * Contents of a new `.test.ts`.
 *
 * Tests live in a `tests/` folder, so the contract is one level up — hence the
 * `../` in the `?raw` import. `contractFileName` is null when the project has
 * no contract yet, in which case the file must still be runnable rather than
 * referencing something that does not exist.
 */
export function testStarter(fileName: string, contractFileName: string | null): string {
  const suite = (contractFileName ?? fileName).replace(/\.(test\.ts|smart\.c)$/, "");

  if (!contractFileName) {
    return `import { describe, it, expect } from "vitest";

// Point this at your contract to start testing it, then load it with
// new SimulatorTestbed(Scenario).loadContract(ContractCode).runScenario():
// import ContractCode from "../my-contract.smart.c?raw";

describe("${suite}", () => {
  it("needs a contract to test", () => {
    expect(1n).toBe(1n);
  });
});
`;
  }

  return `import { describe, it, expect, beforeEach } from "vitest";
import { SimulatorTestbed, type TransactionObj } from "signum-smartc-testbed";
import ContractCode from "../${contractFileName}?raw";

// Transactions sent to the contract. Block 1 activates it.
const Scenario: TransactionObj[] = [
  { blockheight: 1, amount: 2_0000_0000n, sender: 10n, recipient: 1n },
];

describe("${suite}", () => {
  let testbed: SimulatorTestbed;

  beforeEach(() => {
    testbed = new SimulatorTestbed(Scenario).loadContract(ContractCode).runScenario();
  });

  it("activates", () => {
    // Read any contract variable by name, or a map entry with getContractMapValue(k1, k2).
    expect(testbed.getTransactions().length).toBeGreaterThan(0);
  });
});
`;
}
```

- [ ] **Step 4: Accept the new extensions**

In `src/features/project/filetype-icons.tsx`, replace the body of `acceptedFileType` with:

```ts
export function acceptedFileType(name: string): FileTypes | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".smart.c")) return FileTypes.SmartC;
  if (lower.endsWith(".scenario.json")) return FileTypes.Scenario;
  if (lower.endsWith(".asm")) return FileTypes.ASM;
  // `.test.ts` files are run; plain `.ts` files are helpers they import.
  if (lower.endsWith(".ts")) return FileTypes.Test;
  return null;
}
```

Also update the doc comment above it, which currently claims only three types are accepted.

- [ ] **Step 5: Run the tests**

Run: `bun test src/features/testbed/test-starter.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 6: Offer the type in the new-file dialog**

In `src/features/project/new-file-dialog.tsx`:

1. Add to the `EXT` map at the top of the file:

```ts
const EXT: Record<string, string> = {
  [FileTypes.SmartC]: ".smart.c",
  [FileTypes.Scenario]: ".scenario.json",
  [FileTypes.Test]: ".test.ts",
};
```

2. Import the starter:

```ts
import { testStarter } from "@/features/testbed/test-starter";
```

3. Replace the content ternary inside `submit()` with a switch, since there are now three cases:

```ts
  const submit = () => {
    if (!canSubmit) return;
    const ext = EXT[type];
    const finalName = uniqueName(withExtension(base, ext), existingNames, ext);
    // `existingNames` are this folder's files, so a contract is only found when the
    // test is created beside it; otherwise the starter omits the import and says so.
    const contract = existingNames.find((n) => n.endsWith(".smart.c")) ?? null;
    const content =
      type === FileTypes.Scenario
        ? serializeScenario(defaultScenario())
        : type === FileTypes.Test
          ? testStarter(finalName, contract)
          : smartcStarter(finalName.slice(0, -ext.length));
    onCreate(finalName, type, content);
    onOpenChange(false);
  };
```

4. Add a `SelectItem` alongside the existing two. The existing items are plain text labels with no icons, so match that:

```tsx
                <SelectItem value={FileTypes.Test}>
                  Test (.test.ts)
                </SelectItem>
```

- [ ] **Step 7: Verify the whole suite**

Run: `bun test src/features/testbed/`
Expected: PASS, all tests

- [ ] **Step 8: Commit**

```bash
git add src/features/testbed/test-starter.ts src/features/testbed/test-starter.test.ts src/features/project/filetype-icons.tsx src/features/project/new-file-dialog.tsx
git commit -m "feat(studio): create and recognise .test.ts files"
```

---

## Task 6: The run hook

**Files:**
- Create: `src/features/testbed/use-test-run.ts`

This is the wiring: snapshot the project, transpile it, run it in the worker, fold events into state. No unit test — it is composition over pieces that are each already tested, and it needs both Monaco and a Worker. Task 9 verifies it in the browser.

- [ ] **Step 1: Write the hook**

Create `src/features/testbed/use-test-run.ts`:

```ts
import { useCallback, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { FileSystem } from "@/lib/file-system";
import { snapshotProject, isTestEntry } from "./project-snapshot";
import { transpileAll } from "./transpile";
import { runTests, createWorkerTransport } from "./runner-client";
import { initialRunState, reduceEvent, type RunState } from "./test-run-model";

export interface UseTestRun {
  state: RunState;
  isRunning: boolean;
  /** Runs one test file, or every `*.test.ts` in the project when `entryPath` is omitted. */
  run: (monaco: typeof Monaco, projectFolderId: string, entryPath?: string) => Promise<void>;
}

export function useTestRun(): UseTestRun {
  const [state, setState] = useState<RunState>(initialRunState());
  const [isRunning, setIsRunning] = useState(false);
  // Events arrive faster than React commits, so fold against a ref, not state.
  const latest = useRef<RunState>(initialRunState());

  const run = useCallback(
    async (monaco: typeof Monaco, projectFolderId: string, entryPath?: string) => {
      setIsRunning(true);
      latest.current = initialRunState();
      setState(latest.current);

      try {
        const fs = FileSystem.getInstance();
        const snapshot = await snapshotProject(fs, projectFolderId);
        const modules = await transpileAll(monaco, snapshot.tsFiles);

        const entryPaths = entryPath
          ? [entryPath]
          : Object.keys(snapshot.tsFiles).filter(isTestEntry);

        await runTests(
          { modules, rawFiles: snapshot.rawFiles, entryPaths },
          createWorkerTransport(),
          (event) => {
            latest.current = reduceEvent(latest.current, event);
            setState(latest.current);
          },
        );
      } catch (error) {
        // A failure here is in the harness (snapshot or transpile), not in a
        // user's test, so it surfaces as a file-level error rather than silence.
        const e = error as Error;
        latest.current = reduceEvent(latest.current, {
          type: "collect:error",
          file: entryPath ?? "(project)",
          message: e.message,
          stack: e.stack,
        });
        latest.current = reduceEvent(latest.current, { type: "run:end", durationMs: 0 });
        setState(latest.current);
      } finally {
        setIsRunning(false);
      }
    },
    [],
  );

  return { state, isRunning, run };
}
```

- [ ] **Step 2: Confirm it type-checks**

Run: `bunx tsc --noEmit -p . 2>&1 | grep -i "use-test-run" || echo "no errors in use-test-run"`
Expected: `no errors in use-test-run`

(The repo has many pre-existing unrelated type errors; only this file matters.)

- [ ] **Step 3: Commit**

```bash
git add src/features/testbed/use-test-run.ts
git commit -m "feat(studio): wire snapshot, transpile and worker run together"
```

---

## Task 7: Results panel

**Files:**
- Create: `src/features/testbed/ui/test-results-panel.tsx`

Presentational only — it renders `RunState` and owns no logic.

- [ ] **Step 1: Write the component**

Create `src/features/testbed/ui/test-results-panel.tsx`:

```tsx
import { CheckCircle2, XCircle, MinusCircle, Clock, Loader2 } from "lucide-react";
import type { RunState, TestRow } from "../test-run-model";

const STATUS_ICON = {
  running: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
  passed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  timedout: <Clock className="h-4 w-4 text-amber-500" />,
  skipped: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
  todo: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
} as const;

/** bigints have no JSON representation, and they are most of what a contract returns. */
function formatValue(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)) ?? String(value);
  } catch {
    return String(value);
  }
}

function TestRowView({ row }: { row: TestRow }) {
  return (
    <div className="border-b border-border/50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        {STATUS_ICON[row.status]}
        <span className="truncate">{row.path.length ? row.path.join(" › ") : row.name}</span>
        {row.durationMs !== undefined && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{row.durationMs}ms</span>
        )}
      </div>

      {row.failure && (
        <div className="mt-2 rounded bg-red-500/10 p-2 font-mono text-xs">
          <div className="text-red-400">{row.failure.message}</div>
          {row.failure.expected !== undefined && (
            <div className="mt-1 text-muted-foreground">
              <div>expected: {formatValue(row.failure.expected)}</div>
              <div>received: {formatValue(row.failure.actual)}</div>
            </div>
          )}
        </div>
      )}

      {row.logs.length > 0 && (
        <div className="mt-2 rounded bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
          {row.logs.map((line, i) => (
            <div key={i}>
              <span className="opacity-60">{line.level}</span> {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TestResultsPanel({ state }: { state: RunState }) {
  const { counts } = state;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs">
        <span className="text-green-500">{counts.passed} passed</span>
        <span className="text-red-500">{counts.failed} failed</span>
        {counts.skipped > 0 && <span className="text-muted-foreground">{counts.skipped} skipped</span>}
        {counts.timedout > 0 && <span className="text-amber-500">{counts.timedout} timed out</span>}
        {state.durationMs !== undefined && (
          <span className="ml-auto text-muted-foreground">{state.durationMs}ms</span>
        )}
      </div>

      <div className="flex-1 overflow-auto">
        {state.status === "idle" && (
          <p className="p-4 text-sm text-muted-foreground">Press Run to execute this test file.</p>
        )}

        {state.collectErrors.map((error, i) => (
          <div key={i} className="border-b border-border/50 bg-red-500/10 px-3 py-2 text-sm">
            <div className="font-medium text-red-400">Could not load {error.file}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{error.message}</div>
          </div>
        ))}

        {state.hookErrors.map((error, i) => (
          <div key={i} className="border-b border-border/50 bg-amber-500/10 px-3 py-2 text-sm">
            <div className="font-medium text-amber-400">
              {error.phase} failed{error.suite.length ? ` in ${error.suite.join(" › ")}` : ""}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{error.message}</div>
          </div>
        ))}

        {state.rows.map((row) => (
          <TestRowView key={row.id} row={row} />
        ))}

        {state.logs.length > 0 && (
          <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
            {state.logs.map((line, i) => (
              <div key={i}>
                <span className="opacity-60">{line.level}</span> {line.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/features/testbed/ui/test-results-panel.tsx
git commit -m "feat(studio): results panel for test runs"
```

---

## Task 8: The test file editor

**Files:**
- Create: `src/features/testbed/ui/test-file-editor.tsx`
- Modify: `src/pages/files/files-page.tsx`

Read `src/features/smartc-editor/smartc-editor.tsx` first and follow its conventions: `usePageHeaderActions` for toolbar buttons, `useFileSystem` for saving, the `editor:save` handler pattern, and the container-height calculation.

- [ ] **Step 1: Write the editor**

Create `src/features/testbed/ui/test-file-editor.tsx`:

```tsx
import { useCallback, useEffect, useRef, useState } from "react";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { Play } from "lucide-react";
import { toast } from "sonner";
import { useParams } from "react-router";
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from "@/components/ui/resizable";
import { usePageHeaderActions } from "@/hooks/use-page-header-actions.ts";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import { configureTypeScriptForTests } from "../monaco-setup";
import { useTestRun } from "../use-test-run";
import { TestResultsPanel } from "./test-results-panel";

interface Props {
  file: File;
}

export function TestFileEditor({ file }: Props) {
  const { projectId = "" } = useParams<{ projectId: string }>();
  const { addAction, removeAction, updateAction } = usePageHeaderActions();
  const fs = useFileSystem();
  const { theme } = useTheme();
  const monacoRef = useRef<typeof Monaco | null>(null);
  const [code, setCode] = useState(file.content as string);
  const codeRef = useRef(code);
  codeRef.current = code;
  const { state, isRunning, run } = useTestRun();

  const onMount: OnMount = (_editor, monaco) => {
    monacoRef.current = monaco;
    configureTypeScriptForTests(monaco);
  };

  const runFile = useCallback(async () => {
    const monaco = monacoRef.current;
    if (!monaco) return;
    // Save first: the runner reads the project from the file system, not the editor buffer.
    await fs.saveFile(file.metadata.id, codeRef.current);
    await run(monaco, projectId, file.metadata.path);
  }, [fs, file.metadata.id, file.metadata.path, projectId, run]);

  useEffect(() => {
    addAction({
      id: "run-tests",
      tooltip: "Run this test file",
      label: "Run",
      icon: <Play className="h-4 w-4" />,
      onClick: () => {
        runFile().catch((e) => toast.error("Could not run tests: " + (e as Error).message));
      },
      variant: "accent",
    });
    return () => removeAction("run-tests");
  }, [addAction, removeAction, runFile]);

  useEffect(() => {
    updateAction({ id: "run-tests", updates: { disabled: isRunning } });
  }, [isRunning, updateAction]);

  return (
    <ResizablePanelGroup direction="horizontal" className="h-full">
      <ResizablePanel defaultSize={60} minSize={30}>
        <Editor
          height="100%"
          language="typescript"
          path={"file://" + file.metadata.path}
          theme={theme === "dark" ? "vs-dark" : "light"}
          value={code}
          onChange={(value) => setCode(value ?? "")}
          onMount={onMount}
          options={{ minimap: { enabled: false }, fontSize: 13, scrollBeyondLastLine: false }}
        />
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ResizablePanel defaultSize={40} minSize={20}>
        <TestResultsPanel state={state} />
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
```

Note the `path` prop: it makes `@monaco-editor/react` create the model under the same URI `transpileAll` looks for, so the editor's buffer and the transpiled file are the same model rather than two copies that can disagree.

- [ ] **Step 2: Route the file type**

(`src/components/ui/resizable.tsx` already exists in this repo — no new component is needed.)

In `src/pages/files/files-page.tsx`:

1. Import the editor:

```tsx
import { TestFileEditor } from "@/features/testbed/ui/test-file-editor";
```

2. Add a branch alongside the existing ones:

```tsx
          {type === FileTypes.Test && <TestFileEditor key={id} file={file!} />}
```

3. Update the final fallback condition so Test files are no longer reported as unsupported. It currently reads:

```tsx
          {type !== FileTypes.SmartC && type !== FileTypes.ASM && type !== FileTypes.Scenario && (
```

Add `&& type !== FileTypes.Test`.

- [ ] **Step 3: Verify build and tests**

Run: `bun test src/features/testbed/`
Expected: PASS, all tests

Run: `bun run build`
Expected: build succeeds

- [ ] **Step 4: Commit**

```bash
git add src/features/testbed/ui/test-file-editor.tsx src/pages/files/files-page.tsx
git commit -m "feat(studio): test file editor with results panel"
```

---

## Task 9: End-to-end verification and cleanup

**Files:**
- Delete: `src/features/testbed/dev-transpile-probe.ts`
- Modify: `src/features/smartc-editor/smartc-editor.tsx` (remove the probe)

The whole plan exists for this task to succeed. Everything before it was tested in isolation.

- [ ] **Step 1: Remove the temporary probe**

Delete `src/features/testbed/dev-transpile-probe.ts`, and remove the `installTranspileProbe` import and call from `src/features/smartc-editor/smartc-editor.tsx`.

- [ ] **Step 2: Verify in the browser — MANDATORY**

Run `bun dev` and walk the real user path:

1. Create a project, or open an existing one with a `.smart.c` contract
2. Create a folder `tests`
3. Inside it, create a new file of type **Test** named `counter.test.ts`
4. Confirm the starter template appears, and that the imports have **no red squiggles** (this proves the ambient typings loaded)
5. Type `testbed.` inside the test body and confirm autocomplete offers `getContractMemoryValue`, `getContractMapValue`, and friends
6. Press **Run**
7. Confirm the results panel shows the test passing with a duration
8. Change an assertion so it must fail — e.g. `expect(1n).toBe(2n)` — press Run again
9. Confirm the failure shows the message plus `expected: 2n` / `received: 1n`
10. Add `console.log("hi", 5n)` to the test and confirm `hi 5n` appears under that test in the panel

Report what actually happened at each step, including screenshots or exact panel text where useful. If any step fails, report it — do not patch around it.

- [ ] **Step 3: Verify the production path**

Run: `bun run build`
Expected: succeeds, and `dist/testbed-worker.js` is present in the output table.

- [ ] **Step 4: Commit**

```bash
git add -u src/features/smartc-editor/smartc-editor.tsx
git rm src/features/testbed/dev-transpile-probe.ts
git commit -m "chore(studio): remove the transpile probe scaffolding"
```

---

## Done criteria

- A user can create a `.test.ts` file, write a test against a contract with working autocomplete, press Run, and see pass/fail with durations
- A failing assertion shows its message and a bigint-accurate expected/received pair
- `console.log` from a test appears beneath that test
- `bun test src/features/testbed/` passes
- `bun run build` succeeds and emits the worker

## What comes next (Plan 3)

- Gutter decorations per `it()` and click-to-run a single test
- Sourcemap stack mapping so a failure jumps to the right line
- Generated `.d.ts` from the installed packages, replacing the hand-written facade
- Run-all-files across a project
- The session→test generator, `messageHex` on `ScenarioTx`, and the debugger handoff
