# Browser Test Runner Core Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless core that runs SmartC contract unit tests in the browser — module linking, a vitest-shaped test API, real vitest matchers, and worker execution with a timeout watchdog.

**Architecture:** Test files are transpiled to CommonJS (by Monaco's TypeScript worker, in a later plan) and evaluated through a small module registry that resolves relative imports against the project's virtual filesystem, `?raw` imports to file text, and bare specifiers to injected virtual modules (`vitest`, `signum-smartc-testbed`). A collector builds a suite tree, a runner executes it emitting events, and a client drives it all inside a Web Worker with a main-thread watchdog.

**Tech Stack:** TypeScript, Bun (test runner and bundler), `signum-smartc-testbed@^1.2.0`, `@vitest/expect`.

**Spec:** `docs/superpowers/specs/2026-08-22-browser-test-runner-design.md` (phases 1–3)

**Deferred from spec phase 3:** mapping failure stacks back to `.test.ts` line/column
through sourcemaps. Sourcemaps are produced by Monaco's TypeScript worker, which
arrives in Plan 2 — there is nothing to map against until then, so the mapping lands
there alongside it.

**Scope:** This plan covers the headless core only. It produces working, fully tested software with no UI — a later plan adds the Monaco editor, results panel and typings codegen, and a third adds the session→test generator and debugger handoff.

**Working directory:** All commands run from `apps/studio/`.

---

## File Structure

| File | Responsibility |
| --- | --- |
| `src/features/testbed/runner/types.ts` | Shared types: `RunRequest`, `TestEvent`, `TestStatus`, `TestFailure` |
| `src/features/testbed/runner/resolve-path.ts` | POSIX path helpers over VFS paths |
| `src/features/testbed/runner/module-registry.ts` | `require` resolution and CommonJS evaluation |
| `src/features/testbed/runner/expect.ts` | chai + `@vitest/expect` matcher stack |
| `src/features/testbed/runner/test-api.ts` | Collector (the `vitest` module) and suite runner |
| `src/features/testbed/runner/run-request.ts` | Orchestration: registry + collector + runner + console capture |
| `src/features/testbed/runner/worker.ts` | Web Worker entry point |
| `src/features/testbed/runner-client.ts` | Main-thread driver: transport, watchdog, event forwarding |
| `src/features/testbed/__fixtures__/counter.smart.c` | Real contract used by the integration test |

---

## Task 1: Dependencies and shared types

**Files:**
- Modify: `apps/studio/package.json`
- Create: `src/features/testbed/runner/types.ts`

**Note on versions:** `@vitest/expect` re-exports `chai`, so chai must NOT be added separately. Do not add the `typescript` package — npm `latest` is now 7.x (the native port) with a different API surface, and transpilation comes from Monaco's bundled TypeScript in a later plan.

- [ ] **Step 1: Install the two runtime dependencies**

```bash
bun add signum-smartc-testbed@^1.2.0 @vitest/expect
```

- [ ] **Step 2: Verify they resolve and bundle for the browser**

```bash
bun -e 'import("signum-smartc-testbed").then(m => console.log(typeof m.SimulatorTestbed))'
```
Expected: `function`

- [ ] **Step 3: Create the shared types**

Create `src/features/testbed/runner/types.ts`:

```ts
/** A TypeScript project file after transpilation to CommonJS. */
export interface CompiledModule {
  js: string;
  sourceMap?: string;
}

/** Everything the runner needs to execute a set of test files. */
export interface RunRequest {
  /** VFS path → transpiled CommonJS. */
  modules: Record<string, CompiledModule>;
  /** VFS path → raw text, served to `?raw` imports (contract sources). */
  rawFiles: Record<string, string>;
  /** VFS paths of the test files to run. */
  entryPaths: string[];
}

export type TestMode = "run" | "skip" | "todo" | "only";

/** `timedout` is produced by the client watchdog, never by the runner itself. */
export type TestStatus = "passed" | "failed" | "skipped" | "todo" | "timedout";

export interface TestFailure {
  message: string;
  expected?: unknown;
  actual?: unknown;
  stack?: string;
}

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export type TestEvent =
  | { type: "test:start"; id: string; name: string; path: string[]; file: string }
  | { type: "test:end"; id: string; status: TestStatus; durationMs: number; failure?: TestFailure }
  | { type: "console"; testId: string | null; level: ConsoleLevel; text: string }
  | { type: "collect:error"; file: string; message: string; stack?: string }
  | { type: "run:end"; durationMs: number };
```

- [ ] **Step 4: Commit**

```bash
git add package.json ../../bun.lock src/features/testbed/runner/types.ts
git commit -m "feat(studio): add test runner dependencies and shared types"
```

---

## Task 2: POSIX path helpers

**Files:**
- Create: `src/features/testbed/runner/resolve-path.ts`
- Test: `src/features/testbed/runner/resolve-path.test.ts`

VFS paths are absolute POSIX strings like `/MyProject/tests/counter.test.ts` (see `src/lib/file-system/file-system.ts`, which builds `path` as `${folderPath}/${name}`).

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/resolve-path.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner/resolve-path.test.ts`
Expected: FAIL — cannot find module `./resolve-path`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/runner/resolve-path.ts`:

```ts
/** POSIX path helpers over VFS paths, which are absolute (`/proj/tests/a.test.ts`). */

export function dirnameOf(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

/** Collapse `.` and `..` segments. A leading slash is preserved. */
export function normalizePath(path: string): string {
  const absolute = path.startsWith("/");
  const out: string[] = [];
  for (const seg of path.split("/")) {
    if (!seg || seg === ".") continue;
    if (seg === "..") out.pop();
    else out.push(seg);
  }
  return (absolute ? "/" : "") + out.join("/");
}

/** Resolve a relative specifier against the importing module's path. */
export function resolveFrom(importerPath: string, specifier: string): string {
  return normalizePath(dirnameOf(importerPath) + "/" + specifier);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/runner/resolve-path.test.ts`
Expected: PASS, 5 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/resolve-path.ts src/features/testbed/runner/resolve-path.test.ts
git commit -m "feat(studio): add POSIX path helpers for the test runner"
```

---

## Task 3: Module registry — relative imports and cycles

**Files:**
- Create: `src/features/testbed/runner/module-registry.ts`
- Test: `src/features/testbed/runner/module-registry.test.ts`

The registry evaluates CommonJS produced by TypeScript. Transpiled test code looks like this (verified against TypeScript 5.9 with `module: CommonJS, esModuleInterop: true`):

```js
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const counter_smart_c_raw_1 = __importDefault(require("../counter.smart.c?raw"));
const context_1 = require("./context");
```

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/module-registry.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createRegistry } from "./module-registry";

describe("module-registry", () => {
  it("evaluates a module and returns its exports", () => {
    const registry = createRegistry({
      modules: { "/proj/a.ts": { js: `exports.value = 42;` } },
      rawFiles: {},
      virtuals: {},
    });
    expect((registry.require("/proj/a.ts") as any).value).toBe(42);
  });

  it("resolves a relative import between modules", () => {
    const registry = createRegistry({
      modules: {
        "/proj/a.ts": { js: `const b = require("./b"); exports.value = b.value + 1;` },
        "/proj/b.ts": { js: `exports.value = 1;` },
      },
      rawFiles: {},
      virtuals: {},
    });
    expect((registry.require("/proj/a.ts") as any).value).toBe(2);
  });

  it("resolves a parent-directory import", () => {
    const registry = createRegistry({
      modules: {
        "/proj/tests/a.ts": { js: `const h = require("../helper"); exports.value = h.value;` },
        "/proj/helper.ts": { js: `exports.value = "shared";` },
      },
      rawFiles: {},
      virtuals: {},
    });
    expect((registry.require("/proj/tests/a.ts") as any).value).toBe("shared");
  });

  it("evaluates each module only once", () => {
    const registry = createRegistry({
      modules: {
        "/proj/a.ts": { js: `require("./b"); require("./b"); exports.ok = true;` },
        "/proj/b.ts": { js: `globalThis.__evals = (globalThis.__evals ?? 0) + 1;` },
      },
      rawFiles: {},
      virtuals: {},
    });
    (globalThis as any).__evals = 0;
    registry.require("/proj/a.ts");
    expect((globalThis as any).__evals).toBe(1);
  });

  it("survives a circular import by exposing partial exports", () => {
    const registry = createRegistry({
      modules: {
        "/proj/a.ts": {
          js: `exports.name = "a"; const b = require("./b"); exports.fromB = b.name; exports.late = "set-after";`,
        },
        "/proj/b.ts": {
          js: `const a = require("./a"); exports.name = "b"; exports.sawName = a.name; exports.sawLate = a.late;`,
        },
      },
      rawFiles: {},
      virtuals: {},
    });
    const a = registry.require("/proj/a.ts") as any;
    const b = registry.require("/proj/b.ts") as any;
    expect(a.fromB).toBe("b");
    expect(b.sawName).toBe("a"); // saw what `a` had exported so far
    expect(b.sawLate).toBeUndefined(); // did not see what `a` exported later
  });

  it("does not resolve Object.prototype members as virtual modules", () => {
    const registry = createRegistry({
      modules: { "/proj/a.ts": { js: `require("toString");` } },
      rawFiles: {},
      virtuals: { vitest: {} },
    });
    expect(() => registry.require("/proj/a.ts")).toThrow(/toString.*Available: vitest/s);
  });

  it("resolves a bare specifier to a virtual module", () => {
    const registry = createRegistry({
      modules: { "/proj/a.ts": { js: `const v = require("vitest"); exports.value = v.marker;` } },
      rawFiles: {},
      virtuals: { vitest: { marker: "virtual" } },
    });
    expect((registry.require("/proj/a.ts") as any).value).toBe("virtual");
  });

  it("names the available virtuals when a bare specifier is unknown", () => {
    const registry = createRegistry({
      modules: { "/proj/a.ts": { js: `require("lodash");` } },
      rawFiles: {},
      virtuals: { vitest: {} },
    });
    expect(() => registry.require("/proj/a.ts")).toThrow(/lodash.*Available: vitest/s);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner/module-registry.test.ts`
Expected: FAIL — cannot find module `./module-registry`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/runner/module-registry.ts`:

```ts
import { resolveFrom } from "./resolve-path";
import type { CompiledModule } from "./types";

export interface RegistryOptions {
  /** VFS path → transpiled CommonJS. */
  modules: Record<string, CompiledModule>;
  /** VFS path → raw text, served to `?raw` imports. */
  rawFiles: Record<string, string>;
  /** Bare specifier → module exports. */
  virtuals: Record<string, unknown>;
}

export function createRegistry(opts: RegistryOptions) {
  const cache = new Map<string, { exports: any }>();

  function resolveModulePath(importer: string, specifier: string): string {
    const base = resolveFrom(importer, specifier);
    for (const candidate of [base, base + ".ts", base + "/index.ts"]) {
      if (opts.modules[candidate]) return candidate;
    }
    throw new Error(`Cannot find module "${specifier}" imported from "${importer}"`);
  }

  function requireFrom(importer: string, specifier: string): unknown {
    if (!specifier.startsWith(".")) {
      // Object.hasOwn, not `in`: `in` walks the prototype chain, so a specifier
      // like "toString" would resolve to Object.prototype instead of erroring.
      if (Object.hasOwn(opts.virtuals, specifier)) return opts.virtuals[specifier];
      throw new Error(
        `Cannot find module "${specifier}" imported from "${importer}". ` +
          `Available: ${Object.keys(opts.virtuals).join(", ")}`,
      );
    }
    return requirePath(resolveModulePath(importer, specifier));
  }

  function requirePath(path: string): unknown {
    const cached = cache.get(path);
    if (cached) return cached.exports;

    const compiled = opts.modules[path];
    if (!compiled) throw new Error(`Cannot find module "${path}"`);

    const module = { exports: {} as any };
    // Cache before evaluating, so a cycle sees partial exports instead of recursing forever.
    cache.set(path, module);

    const fn = new Function("require", "exports", "module", compiled.js + "\n//# sourceURL=" + path);
    fn((spec: string) => requireFrom(path, spec), module.exports, module);
    return module.exports;
  }

  return { require: requirePath };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/runner/module-registry.test.ts`
Expected: PASS, 8 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/module-registry.ts src/features/testbed/runner/module-registry.test.ts
git commit -m "feat(studio): add CommonJS module registry for test execution"
```

---

## Task 4: Module registry — `?raw` contract imports

**Files:**
- Modify: `src/features/testbed/runner/module-registry.ts`
- Modify: `src/features/testbed/runner/module-registry.test.ts`

This is how a test binds its contract: `import ContractCode from "../counter.smart.c?raw"`.

- [ ] **Step 1: Write the failing tests**

Append these cases inside the `describe("module-registry", ...)` block in `src/features/testbed/runner/module-registry.test.ts`:

```ts
  it("serves a ?raw import as the file text", () => {
    const registry = createRegistry({
      modules: {
        "/proj/tests/a.ts": {
          js: `const c = require("../counter.smart.c?raw"); exports.code = c.default;`,
        },
      },
      rawFiles: { "/proj/counter.smart.c": "#program name Counter" },
      virtuals: {},
    });
    expect((registry.require("/proj/tests/a.ts") as any).code).toBe("#program name Counter");
  });

  it("marks the ?raw module as __esModule so TS default-interop works", () => {
    const registry = createRegistry({
      modules: {
        "/proj/a.ts": {
          js: `var __importDefault = (this && this.__importDefault) || function (mod) {
                 return (mod && mod.__esModule) ? mod : { "default": mod };
               };
               const c = __importDefault(require("./x.smart.c?raw"));
               exports.code = c.default;`,
        },
      },
      rawFiles: { "/proj/x.smart.c": "SOURCE" },
      virtuals: {},
    });
    expect((registry.require("/proj/a.ts") as any).code).toBe("SOURCE");
  });

  it("lists sibling files when a ?raw import misses", () => {
    const registry = createRegistry({
      modules: { "/proj/tests/a.ts": { js: `require("../typo.smart.c?raw");` } },
      rawFiles: { "/proj/counter.smart.c": "x", "/proj/token.smart.c": "y" },
      virtuals: {},
    });
    expect(() => registry.require("/proj/tests/a.ts")).toThrow(
      /\/proj\/typo\.smart\.c.*counter\.smart\.c.*token\.smart\.c/s,
    );
  });
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `bun test src/features/testbed/runner/module-registry.test.ts`
Expected: FAIL — the `?raw` specifier is treated as a relative module, so the error is "Cannot find module"

- [ ] **Step 3: Add `?raw` handling**

In `src/features/testbed/runner/module-registry.ts`, widen the path import to bring in `dirnameOf`:

```ts
import { dirnameOf, resolveFrom } from "./resolve-path";
```

Add the constant below the imports:

```ts
const RAW_SUFFIX = "?raw";
```

Add these two functions inside `createRegistry`, above `resolveModulePath`:

```ts
  function siblingsOf(path: string): string[] {
    const dir = dirnameOf(path);
    return Object.keys(opts.rawFiles).filter((p) => dirnameOf(p) === dir);
  }

  function loadRaw(importer: string, specifier: string) {
    const bare = specifier.slice(0, -RAW_SUFFIX.length);
    const path = bare.startsWith(".") ? resolveFrom(importer, bare) : bare;
    const text = opts.rawFiles[path];
    if (text === undefined) {
      const siblings = siblingsOf(path);
      throw new Error(
        `Cannot find file "${path}" imported from "${importer}".` +
          (siblings.length ? ` Files in that folder: ${siblings.join(", ")}` : ""),
      );
    }
    // TS's `__importDefault` checks `__esModule` before taking `.default`.
    return { __esModule: true, default: text };
  }
```

Then add this as the first line of `requireFrom`:

```ts
    if (specifier.endsWith(RAW_SUFFIX)) return loadRaw(importer, specifier);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/features/testbed/runner/module-registry.test.ts`
Expected: PASS, 10 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/module-registry.ts src/features/testbed/runner/module-registry.test.ts
git commit -m "feat(studio): resolve ?raw imports to contract source text"
```

---

## Task 5: The matcher stack

**Files:**
- Create: `src/features/testbed/runner/expect.ts`
- Test: `src/features/testbed/runner/expect.test.ts`

Contract values are `bigint`, so bigint support in matchers and diffs is the thing to verify.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/expect.test.ts`:

```ts
import { describe, it, expect as bunExpect } from "bun:test";
import { expect } from "./expect";

describe("expect", () => {
  it("compares bigints with toBe", () => {
    expect(5n).toBe(5n);
  });

  it("deep-compares structures containing bigints", () => {
    expect([{ amount: 100n }]).toEqual([{ amount: 100n }]);
  });

  it("exposes expected and actual on failure for diffing", () => {
    let error: any;
    try {
      expect(1n).toBe(2n);
    } catch (e) {
      error = e;
    }
    bunExpect(error).toBeDefined();
    bunExpect(error.expected).toBe(2n);
    bunExpect(error.actual).toBe(1n);
    bunExpect(error.message).toContain("expected 1n to be 2n");
  });

  it("supports negation", () => {
    expect(1n).not.toBe(2n);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner/expect.test.ts`
Expected: FAIL — cannot find module `./expect`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/runner/expect.ts`:

```ts
import {
  chai,
  JestChaiExpect,
  JestExtend,
  JestAsymmetricMatchers,
  type ExpectStatic,
} from "@vitest/expect";

// vitest's own matcher stack, so bigint comparison and the expected/actual
// payload on failures behave exactly as they do under vitest.
chai.use(JestExtend);
chai.use(JestChaiExpect);
chai.use(JestAsymmetricMatchers);

export const expect = chai.expect as unknown as ExpectStatic;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/runner/expect.test.ts`
Expected: PASS, 4 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/expect.ts src/features/testbed/runner/expect.test.ts
git commit -m "feat(studio): wire vitest matcher stack for the test runner"
```

---

## Task 6: Collector — building the suite tree

**Files:**
- Create: `src/features/testbed/runner/test-api.ts`
- Test: `src/features/testbed/runner/test-api.test.ts`

The collector *is* the virtual `vitest` module. Calling `describe`/`it` builds a tree; nothing executes yet.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/test-api.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createCollector } from "./test-api";

describe("collector", () => {
  it("collects tests into nested suites", () => {
    const { api, root } = createCollector("/x.test.ts");
    api.describe("outer", () => {
      api.it("a", () => {});
      api.describe("inner", () => {
        api.it("b", () => {});
      });
    });

    const outer = root.children[0] as any;
    expect(outer.kind).toBe("suite");
    expect(outer.name).toBe("outer");
    expect(outer.children[0].name).toBe("a");
    expect(outer.children[1].kind).toBe("suite");
    expect(outer.children[1].children[0].path).toEqual(["outer", "inner", "b"]);
  });

  it("does not execute test bodies while collecting", () => {
    const { api } = createCollector("/x.test.ts");
    let ran = false;
    api.describe("s", () => {
      api.it("t", () => {
        ran = true;
      });
    });
    expect(ran).toBe(false);
  });

  it("records modes for skip, only and todo", () => {
    const { api, root } = createCollector("/x.test.ts");
    api.it("plain", () => {});
    api.it.skip("skipped", () => {});
    api.it.only("focused", () => {});
    api.it.todo("later");
    expect(root.children.map((c: any) => c.mode)).toEqual(["run", "skip", "only", "todo"]);
  });

  it("gives every test a unique id scoped to the file", () => {
    const { api, root } = createCollector("/x.test.ts");
    api.it("a", () => {});
    api.it("b", () => {});
    const ids = root.children.map((c: any) => c.id);
    expect(ids).toEqual(["/x.test.ts#0", "/x.test.ts#1"]);
  });

  it("attaches hooks to the suite being collected", () => {
    const { api, root } = createCollector("/x.test.ts");
    api.beforeEach(() => {});
    api.describe("s", () => {
      api.beforeEach(() => {});
      api.beforeAll(() => {});
    });
    expect(root.beforeEach).toHaveLength(1);
    expect((root.children[0] as any).beforeEach).toHaveLength(1);
    expect((root.children[0] as any).beforeAll).toHaveLength(1);
  });

  it("exposes expect on the api", () => {
    const { api } = createCollector("/x.test.ts");
    expect(typeof api.expect).toBe("function");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner/test-api.test.ts`
Expected: FAIL — cannot find module `./test-api`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/runner/test-api.ts`:

```ts
import { expect } from "./expect";
import type { TestMode } from "./types";

export interface TestCase {
  kind: "test";
  id: string;
  name: string;
  path: string[];
  mode: TestMode;
  fn: () => unknown;
}

export interface Suite {
  kind: "suite";
  name: string;
  path: string[];
  mode: TestMode;
  children: Array<Suite | TestCase>;
  beforeAll: Array<() => unknown>;
  afterAll: Array<() => unknown>;
  beforeEach: Array<() => unknown>;
  afterEach: Array<() => unknown>;
}

function makeSuite(name: string, path: string[], mode: TestMode): Suite {
  return {
    kind: "suite",
    name,
    path,
    mode,
    children: [],
    beforeAll: [],
    afterAll: [],
    beforeEach: [],
    afterEach: [],
  };
}

/** Builds the `vitest` module for one file, plus the suite tree it collects into. */
export function createCollector(file: string) {
  const root = makeSuite("", [], "run");
  let current = root;
  let nextId = 0;

  function addSuite(name: string, fn: () => void, mode: TestMode) {
    const suite = makeSuite(name, [...current.path, name], mode);
    current.children.push(suite);
    const parent = current;
    current = suite;
    try {
      fn();
    } finally {
      current = parent;
    }
  }

  function addTest(name: string, fn: () => unknown, mode: TestMode) {
    current.children.push({
      kind: "test",
      id: `${file}#${nextId++}`,
      name,
      path: [...current.path, name],
      mode,
      fn,
    });
  }

  const describe = Object.assign((name: string, fn: () => void) => addSuite(name, fn, "run"), {
    skip: (name: string, fn: () => void) => addSuite(name, fn, "skip"),
    only: (name: string, fn: () => void) => addSuite(name, fn, "only"),
  });

  const it = Object.assign((name: string, fn: () => unknown) => addTest(name, fn, "run"), {
    skip: (name: string, fn: () => unknown) => addTest(name, fn, "skip"),
    only: (name: string, fn: () => unknown) => addTest(name, fn, "only"),
    todo: (name: string) => addTest(name, () => {}, "todo"),
  });

  const api = {
    __esModule: true,
    describe,
    it,
    test: it,
    expect,
    beforeAll: (fn: () => unknown) => current.beforeAll.push(fn),
    afterAll: (fn: () => unknown) => current.afterAll.push(fn),
    beforeEach: (fn: () => unknown) => current.beforeEach.push(fn),
    afterEach: (fn: () => unknown) => current.afterEach.push(fn),
  };

  return { api, root };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/runner/test-api.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/test-api.ts src/features/testbed/runner/test-api.test.ts
git commit -m "feat(studio): collect describe/it into a suite tree"
```

---

## Task 7: Suite runner — hooks, async, failures

**Files:**
- Modify: `src/features/testbed/runner/test-api.ts`
- Test: `src/features/testbed/runner/run-suite.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/run-suite.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createCollector, runSuite } from "./test-api";
import type { TestEvent } from "./types";

async function collectAndRun(build: (api: any) => void) {
  const { api, root } = createCollector("/x.test.ts");
  build(api);
  const events: TestEvent[] = [];
  await runSuite(root, "/x.test.ts", (e) => events.push(e));
  return events;
}

const statuses = (events: TestEvent[]) =>
  events.filter((e) => e.type === "test:end").map((e: any) => e.status);

describe("runSuite", () => {
  it("emits start and end for a passing test", async () => {
    const events = await collectAndRun((api) => {
      api.it("passes", () => {});
    });
    expect(events[0].type).toBe("test:start");
    expect((events[1] as any).status).toBe("passed");
  });

  it("captures a failure with message, expected and actual", async () => {
    const events = await collectAndRun((api) => {
      api.it("fails", () => {
        api.expect(1n).toBe(2n);
      });
    });
    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.status).toBe("failed");
    expect(end.failure.expected).toBe(2n);
    expect(end.failure.actual).toBe(1n);
    expect(end.failure.message).toContain("expected 1n to be 2n");
  });

  it("captures a thrown non-Error", async () => {
    const events = await collectAndRun((api) => {
      api.it("throws a string", () => {
        throw "boom";
      });
    });
    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.failure.message).toBe("boom");
  });

  it("awaits async test bodies", async () => {
    const events = await collectAndRun((api) => {
      api.it("async fails", async () => {
        await Promise.resolve();
        throw new Error("late");
      });
    });
    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.status).toBe("failed");
    expect(end.failure.message).toBe("late");
  });

  it("runs hooks outside-in for beforeEach and inside-out for afterEach", async () => {
    const order: string[] = [];
    await collectAndRun((api) => {
      api.beforeEach(() => order.push("outer-before"));
      api.afterEach(() => order.push("outer-after"));
      api.describe("inner", () => {
        api.beforeEach(() => order.push("inner-before"));
        api.afterEach(() => order.push("inner-after"));
        api.it("t", () => order.push("test"));
      });
    });
    expect(order).toEqual(["outer-before", "inner-before", "test", "inner-after", "outer-after"]);
  });

  it("runs beforeAll once per suite and afterAll after its tests", async () => {
    const order: string[] = [];
    await collectAndRun((api) => {
      api.describe("s", () => {
        api.beforeAll(() => order.push("all-before"));
        api.afterAll(() => order.push("all-after"));
        api.it("t1", () => order.push("t1"));
        api.it("t2", () => order.push("t2"));
      });
    });
    expect(order).toEqual(["all-before", "t1", "t2", "all-after"]);
  });

  it("skips a skipped test without running its body", async () => {
    let ran = false;
    const events = await collectAndRun((api) => {
      api.it.skip("skipped", () => {
        ran = true;
      });
    });
    expect(ran).toBe(false);
    expect(statuses(events)).toEqual(["skipped"]);
  });

  it("reports a todo test", async () => {
    const events = await collectAndRun((api) => {
      api.it.todo("later");
    });
    expect(statuses(events)).toEqual(["todo"]);
  });

  it("skips every test in a skipped suite", async () => {
    const events = await collectAndRun((api) => {
      api.describe.skip("s", () => {
        api.it("a", () => {});
        api.it("b", () => {});
      });
    });
    expect(statuses(events)).toEqual(["skipped", "skipped"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner/run-suite.test.ts`
Expected: FAIL — `runSuite` is not exported from `./test-api`

- [ ] **Step 3: Add the runner**

First widen the existing type import at the top of `src/features/testbed/runner/test-api.ts`:

```ts
import type { TestEvent, TestFailure, TestMode } from "./types";
```

Then append to the same file:

```ts
function toFailure(error: unknown): TestFailure {
  const e = error as any;
  if (!(e instanceof Error)) return { message: String(error) };
  return { message: e.message, expected: e.expected, actual: e.actual, stack: e.stack };
}

/** Runs a collected suite tree, emitting events as it goes. */
export async function runSuite(
  root: Suite,
  file: string,
  emit: (event: TestEvent) => void,
): Promise<void> {
  async function runNode(
    node: Suite,
    inheritedBeforeEach: Array<Array<() => unknown>>,
    inheritedAfterEach: Array<Array<() => unknown>>,
    skipped: boolean,
  ) {
    const suiteSkipped = skipped || node.mode === "skip";
    if (!suiteSkipped) for (const hook of node.beforeAll) await hook();

    const beforeEach = [...inheritedBeforeEach, node.beforeEach];
    const afterEach = [node.afterEach, ...inheritedAfterEach];

    for (const child of node.children) {
      if (child.kind === "suite") await runNode(child, beforeEach, afterEach, suiteSkipped);
      else await runTest(child, beforeEach, afterEach, suiteSkipped);
    }

    if (!suiteSkipped) for (const hook of node.afterAll) await hook();
  }

  async function runTest(
    test: TestCase,
    beforeEach: Array<Array<() => unknown>>,
    afterEach: Array<Array<() => unknown>>,
    skipped: boolean,
  ) {
    if (test.mode === "todo") {
      emit({ type: "test:end", id: test.id, status: "todo", durationMs: 0 });
      return;
    }
    if (skipped || test.mode === "skip") {
      emit({ type: "test:end", id: test.id, status: "skipped", durationMs: 0 });
      return;
    }

    emit({ type: "test:start", id: test.id, name: test.name, path: test.path, file });
    const started = Date.now();
    try {
      for (const hooks of beforeEach) for (const hook of hooks) await hook();
      await test.fn();
      for (const hooks of afterEach) for (const hook of hooks) await hook();
      emit({ type: "test:end", id: test.id, status: "passed", durationMs: Date.now() - started });
    } catch (error) {
      emit({
        type: "test:end",
        id: test.id,
        status: "failed",
        durationMs: Date.now() - started,
        failure: toFailure(error),
      });
    }
  }

  await runNode(root, [], [], false);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/runner/run-suite.test.ts`
Expected: PASS, 9 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/test-api.ts src/features/testbed/runner/run-suite.test.ts
git commit -m "feat(studio): run collected suites with hooks and failure capture"
```

---

## Task 8: `only` semantics

**Files:**
- Modify: `src/features/testbed/runner/test-api.ts`
- Test: `src/features/testbed/runner/run-suite-only.test.ts`

The subtle rule: `describe.only` promotes **every test inside it**, even though those tests have mode `run`. A naive `mode !== "only"` check skips them all.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/run-suite-only.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createCollector, runSuite } from "./test-api";
import type { TestEvent } from "./types";

async function statuses(build: (api: any) => void) {
  const { api, root } = createCollector("/x.test.ts");
  build(api);
  const events: TestEvent[] = [];
  await runSuite(root, "/x.test.ts", (e) => events.push(e));
  return events.filter((e) => e.type === "test:end").map((e: any) => e.status);
}

describe("only semantics", () => {
  it("runs everything when no only is present", async () => {
    expect(
      await statuses((api) => {
        api.describe("A", () => {
          api.it("a1", () => {});
          api.it("a2", () => {});
        });
      }),
    ).toEqual(["passed", "passed"]);
  });

  it("it.only runs just that test", async () => {
    expect(
      await statuses((api) => {
        api.describe("A", () => {
          api.it("a1", () => {});
          api.it.only("a2", () => {});
        });
      }),
    ).toEqual(["skipped", "passed"]);
  });

  it("describe.only runs every test inside it and skips the rest", async () => {
    expect(
      await statuses((api) => {
        api.describe.only("A", () => {
          api.it("a1", () => {});
          api.it("a2", () => {});
        });
        api.describe("B", () => {
          api.it("b1", () => {});
        });
      }),
    ).toEqual(["passed", "passed", "skipped"]);
  });

  it("an only nested in a plain suite still wins", async () => {
    expect(
      await statuses((api) => {
        api.describe("A", () => {
          api.describe("B", () => {
            api.it.only("b1", () => {});
          });
          api.it("a1", () => {});
        });
      }),
    ).toEqual(["passed", "skipped"]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner/run-suite-only.test.ts`
Expected: FAIL — every test still passes because `only` is ignored, so the second case returns `["passed", "passed"]` instead of `["skipped", "passed"]`

- [ ] **Step 3: Implement only-mode**

In `src/features/testbed/runner/test-api.ts`, add this helper next to `toFailure`:

```ts
function hasOnly(node: Suite | TestCase): boolean {
  if (node.mode === "only") return true;
  return node.kind === "suite" && node.children.some(hasOnly);
}
```

Inside `runSuite`, add this line as the first statement of the function body:

```ts
  const onlyMode = hasOnly(root);
```

Replace `runNode`'s signature and its first two statements with:

```ts
  async function runNode(
    node: Suite,
    inheritedBeforeEach: Array<Array<() => unknown>>,
    inheritedAfterEach: Array<Array<() => unknown>>,
    skipped: boolean,
    withinOnly: boolean,
  ) {
    // `describe.only` promotes every test inside it, so carry that down the tree.
    const insideOnly = withinOnly || node.mode === "only";
    const suiteSkipped = skipped || node.mode === "skip" || (onlyMode && !insideOnly && !hasOnly(node));
```

Update the two recursive calls in `runNode` to pass `insideOnly`:

```ts
      if (child.kind === "suite") await runNode(child, beforeEach, afterEach, suiteSkipped, insideOnly);
      else await runTest(child, beforeEach, afterEach, suiteSkipped, insideOnly);
```

Add the parameter to `runTest`:

```ts
  async function runTest(
    test: TestCase,
    beforeEach: Array<Array<() => unknown>>,
    afterEach: Array<Array<() => unknown>>,
    skipped: boolean,
    withinOnly: boolean,
  ) {
```

Replace its skip check with:

```ts
    if (skipped || test.mode === "skip" || (onlyMode && !withinOnly && test.mode !== "only")) {
```

And update the bottom call:

```ts
  await runNode(root, [], [], false, false);
```

- [ ] **Step 4: Run both suite test files to verify nothing regressed**

Run: `bun test src/features/testbed/runner/run-suite-only.test.ts src/features/testbed/runner/run-suite.test.ts`
Expected: PASS, 13 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/test-api.ts src/features/testbed/runner/run-suite-only.test.ts
git commit -m "feat(studio): support it.only and describe.only"
```

---

## Task 9: Run orchestration

**Files:**
- Create: `src/features/testbed/runner/run-request.ts`
- Test: `src/features/testbed/runner/run-request.test.ts`

Ties it together: for each entry file, build a registry with a fresh collector, require the file, then run what it collected.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/run-request.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { runRequest } from "./run-request";
import type { TestEvent } from "./types";

async function run(request: any) {
  const events: TestEvent[] = [];
  await runRequest(request, (e) => events.push(e));
  return events;
}

describe("runRequest", () => {
  it("runs tests collected from an entry file", async () => {
    const events = await run({
      modules: {
        "/proj/a.test.ts": {
          js: `const v = require("vitest");
               v.describe("s", () => { v.it("t", () => { v.expect(1n).toBe(1n); }); });`,
        },
      },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts"],
    });
    const end = events.find((e) => e.type === "test:end") as any;
    expect(end.status).toBe("passed");
  });

  it("exposes the real testbed package to tests", async () => {
    const events = await run({
      modules: {
        "/proj/a.test.ts": {
          js: `const v = require("vitest");
               const tb = require("signum-smartc-testbed");
               v.it("has the class", () => { v.expect(typeof tb.SimulatorTestbed).toBe("function"); });`,
        },
      },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts"],
    });
    expect((events.find((e) => e.type === "test:end") as any).status).toBe("passed");
  });

  it("reports a collection error instead of throwing", async () => {
    const events = await run({
      modules: { "/proj/a.test.ts": { js: `throw new Error("bad import");` } },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts"],
    });
    const error = events.find((e) => e.type === "collect:error") as any;
    expect(error.file).toBe("/proj/a.test.ts");
    expect(error.message).toBe("bad import");
  });

  it("continues to the next file after a collection error", async () => {
    const events = await run({
      modules: {
        "/proj/bad.test.ts": { js: `throw new Error("nope");` },
        "/proj/good.test.ts": {
          js: `const v = require("vitest"); v.it("t", () => {});`,
        },
      },
      rawFiles: {},
      entryPaths: ["/proj/bad.test.ts", "/proj/good.test.ts"],
    });
    expect(events.some((e) => e.type === "collect:error")).toBe(true);
    expect((events.find((e) => e.type === "test:end") as any).status).toBe("passed");
  });

  it("gives each entry file its own collector", async () => {
    const events = await run({
      modules: {
        "/proj/a.test.ts": { js: `const v = require("vitest"); v.it("a", () => {});` },
        "/proj/b.test.ts": { js: `const v = require("vitest"); v.it("b", () => {});` },
      },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts", "/proj/b.test.ts"],
    });
    const starts = events.filter((e) => e.type === "test:start") as any[];
    expect(starts.map((s) => s.file)).toEqual(["/proj/a.test.ts", "/proj/b.test.ts"]);
  });

  it("ends the run with a run:end event", async () => {
    const events = await run({
      modules: { "/proj/a.test.ts": { js: `const v = require("vitest"); v.it("t", () => {});` } },
      rawFiles: {},
      entryPaths: ["/proj/a.test.ts"],
    });
    expect(events[events.length - 1].type).toBe("run:end");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner/run-request.test.ts`
Expected: FAIL — cannot find module `./run-request`

- [ ] **Step 3: Write the implementation**

Create `src/features/testbed/runner/run-request.ts`:

```ts
import * as testbedPkg from "signum-smartc-testbed";
import { createRegistry } from "./module-registry";
import { createCollector, runSuite } from "./test-api";
import type { RunRequest, TestEvent } from "./types";

/**
 * Executes a run request in the current realm. Used by both the worker
 * (normal runs) and the main thread (debug runs, where DevTools can attach).
 */
export async function runRequest(
  request: RunRequest,
  emit: (event: TestEvent) => void,
): Promise<void> {
  const started = Date.now();

  for (const entry of request.entryPaths) {
    // A fresh collector per file, so suites from one file never leak into another.
    const { api, root } = createCollector(entry);
    const registry = createRegistry({
      modules: request.modules,
      rawFiles: request.rawFiles,
      virtuals: {
        vitest: api,
        "signum-smartc-testbed": { __esModule: true, ...testbedPkg },
      },
    });

    try {
      registry.require(entry);
    } catch (error) {
      const e = error as Error;
      emit({ type: "collect:error", file: entry, message: e.message, stack: e.stack });
      continue;
    }

    await runSuite(root, entry, emit);
  }

  emit({ type: "run:end", durationMs: Date.now() - started });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/runner/run-request.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/run-request.ts src/features/testbed/runner/run-request.test.ts
git commit -m "feat(studio): orchestrate module linking and suite execution"
```

---

## Task 10: Console capture

**Files:**
- Modify: `src/features/testbed/runner/run-request.ts`
- Test: `src/features/testbed/runner/console-capture.test.ts`

Test output must reach the UI. Note the testbed itself calls `console.debug("Blocks forged until height N")` on every `runScenario`, so debug output will be common — capture it and let the UI filter.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner/console-capture.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { runRequest } from "./run-request";
import type { TestEvent } from "./types";

async function run(js: string) {
  const events: TestEvent[] = [];
  await runRequest(
    { modules: { "/proj/a.test.ts": { js } }, rawFiles: {}, entryPaths: ["/proj/a.test.ts"] },
    (e) => events.push(e),
  );
  return events;
}

describe("console capture", () => {
  it("forwards console.log from inside a test, attributed to it", async () => {
    const events = await run(
      `const v = require("vitest"); v.it("t", () => { console.log("hello", 42); });`,
    );
    const line = events.find((e) => e.type === "console") as any;
    expect(line.text).toBe("hello 42");
    expect(line.level).toBe("log");
    expect(line.testId).toBe("/proj/a.test.ts#0");
  });

  it("formats bigints readably", async () => {
    const events = await run(`const v = require("vitest"); v.it("t", () => { console.log(5n); });`);
    expect((events.find((e) => e.type === "console") as any).text).toBe("5n");
  });

  it("captures warn and error levels", async () => {
    const events = await run(
      `const v = require("vitest"); v.it("t", () => { console.warn("w"); console.error("e"); });`,
    );
    const levels = events.filter((e) => e.type === "console").map((e: any) => e.level);
    expect(levels).toEqual(["warn", "error"]);
  });

  it("attributes output during collection to no test", async () => {
    const events = await run(`console.log("collecting"); const v = require("vitest");`);
    expect((events.find((e) => e.type === "console") as any).testId).toBeNull();
  });

  it("restores the original console afterwards", async () => {
    const original = console.log;
    await run(`const v = require("vitest"); v.it("t", () => { console.log("x"); });`);
    expect(console.log).toBe(original);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner/console-capture.test.ts`
Expected: FAIL — no `console` events are emitted

- [ ] **Step 3: Add capture to `run-request.ts`**

Add the import of `ConsoleLevel` to the existing type import:

```ts
import type { ConsoleLevel, RunRequest, TestEvent } from "./types";
```

Add this helper above `runRequest`:

```ts
const CONSOLE_LEVELS: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

function formatArg(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)) ?? String(value);
  } catch {
    return String(value);
  }
}
```

Then wrap the body of `runRequest`. Replace `const started = Date.now();` with:

```ts
  const started = Date.now();

  // Attribute console output to whichever test is running when it happens.
  let currentTestId: string | null = null;
  const emitTracked = (event: TestEvent) => {
    if (event.type === "test:start") currentTestId = event.id;
    if (event.type === "test:end") currentTestId = null;
    emit(event);
  };

  const originalConsole = globalThis.console;
  const patched = Object.create(originalConsole) as Console;
  for (const level of CONSOLE_LEVELS) {
    (patched as any)[level] = (...args: unknown[]) => {
      emit({ type: "console", testId: currentTestId, level, text: args.map(formatArg).join(" ") });
    };
  }
  globalThis.console = patched;

  try {
```

Change the two `emit(` calls inside the loop to `emitTracked(`, change `await runSuite(root, entry, emit)` to `await runSuite(root, entry, emitTracked)`, and replace the final emit with:

```ts
  } finally {
    globalThis.console = originalConsole;
  }

  emit({ type: "run:end", durationMs: Date.now() - started });
```

Make sure the `for (const entry of ...)` loop sits inside the `try`.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun test src/features/testbed/runner/console-capture.test.ts src/features/testbed/runner/run-request.test.ts`
Expected: PASS, 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/runner/run-request.ts src/features/testbed/runner/console-capture.test.ts
git commit -m "feat(studio): forward console output from tests as events"
```

---

## Task 11: Integration — a real contract through the real testbed

**Files:**
- Create: `src/features/testbed/__fixtures__/counter.smart.c`
- Test: `src/features/testbed/runner/integration.test.ts`

This is the test that proves the whole core works. The contract and its expected values below were verified against `signum-smartc-testbed@1.2.0`: two transactions produce `counter = 2n`, `lastSender = 20n`, `map(1, 10) = 1n` and `map(1, 20) = 2n`.

The test uses hand-written CommonJS rather than transpiled TypeScript, because transpilation belongs to Monaco and arrives in a later plan.

- [ ] **Step 1: Create the contract fixture**

Create `src/features/testbed/__fixtures__/counter.smart.c`:

```c
#program name Counter
#program description Counts incoming transactions and remembers the last sender
#program activationAmount 1_0000_0000

#pragma maxAuxVars 2
#pragma optimizationLevel 3

long counter;
long lastSender;

struct TXINFO {
    long txId;
    long sender;
} currentTx;

void main () {
    while ((currentTx.txId = getNextTx()) != 0) {
        currentTx.sender = getSender(currentTx.txId);
        counter++;
        lastSender = currentTx.sender;
        setMapValue(1, currentTx.sender, counter);
    }
}
```

- [ ] **Step 2: Write the failing test**

Create `src/features/testbed/runner/integration.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { runRequest } from "./run-request";
import type { TestEvent } from "./types";

const contractSource = await Bun.file(
  new URL("../__fixtures__/counter.smart.c", import.meta.url),
).text();

// Hand-written CommonJS, matching what TypeScript emits for:
//   import { describe, it, expect, beforeEach } from "vitest";
//   import { SimulatorTestbed } from "signum-smartc-testbed";
//   import ContractCode from "../counter.smart.c?raw";
//   import { Scenario } from "./scenarios";
const testFile = `
const vitest_1 = require("vitest");
const testbed_1 = require("signum-smartc-testbed");
var __importDefault = (this && this.__importDefault) || function (mod) {
  return (mod && mod.__esModule) ? mod : { "default": mod };
};
const code_1 = __importDefault(require("../counter.smart.c?raw"));
const scenarios_1 = require("./scenarios");

vitest_1.describe("Counter", () => {
  let testbed;
  vitest_1.beforeEach(() => {
    testbed = new testbed_1.SimulatorTestbed(scenarios_1.Scenario)
      .loadContract(code_1.default)
      .runScenario();
  });
  vitest_1.it("counts every incoming transaction", () => {
    vitest_1.expect(testbed.getContractMemoryValue("counter")).toBe(2n);
  });
  vitest_1.it("remembers the last sender", () => {
    vitest_1.expect(testbed.getContractMemoryValue("lastSender")).toBe(20n);
  });
  vitest_1.it("writes per-sender counts to the map", () => {
    vitest_1.expect(testbed.getContractMapValue(1n, 10n)).toBe(1n);
    vitest_1.expect(testbed.getContractMapValue(1n, 20n)).toBe(2n);
  });
  vitest_1.it("reports a wrong expectation as a failure", () => {
    vitest_1.expect(testbed.getContractMemoryValue("counter")).toBe(99n);
  });
});
`;

const scenariosFile = `
exports.Scenario = [
  { blockheight: 1, amount: 2_0000_0000n, sender: 10n, recipient: 1n },
  { blockheight: 2, amount: 2_0000_0000n, sender: 20n, recipient: 1n },
];
`;

async function runIntegration() {
  const events: TestEvent[] = [];
  await runRequest(
    {
      modules: {
        "/proj/tests/counter.test.ts": { js: testFile },
        "/proj/tests/scenarios.ts": { js: scenariosFile },
      },
      rawFiles: { "/proj/counter.smart.c": contractSource },
      entryPaths: ["/proj/tests/counter.test.ts"],
    },
    (e) => events.push(e),
  );
  return events;
}

describe("integration: real contract through the real testbed", () => {
  it("compiles the contract, runs the scenario and reports each result", async () => {
    const ends = (await runIntegration()).filter((e) => e.type === "test:end") as any[];
    expect(ends.map((e) => e.status)).toEqual(["passed", "passed", "passed", "failed"]);
  });

  it("reports the deliberate failure with a bigint diff", async () => {
    const ends = (await runIntegration()).filter((e) => e.type === "test:end") as any[];
    const failure = ends[3].failure;
    expect(failure.expected).toBe(99n);
    expect(failure.actual).toBe(2n);
    expect(failure.message).toContain("expected 2n to be 99n");
  });

  it("records a duration for each executed test", async () => {
    const ends = (await runIntegration()).filter((e) => e.type === "test:end") as any[];
    for (const end of ends) expect(typeof end.durationMs).toBe("number");
  });
});
```

- [ ] **Step 3: Run the test — it should PASS immediately**

Run: `bun test src/features/testbed/runner/integration.test.ts`
Expected: PASS, 3 tests

This task has no red phase on purpose: every piece it exercises was built and tested
in Tasks 1–10, and this test exists to prove they compose. A failure here is a real
defect in an earlier task — diagnose it there rather than patching this test.

- [ ] **Step 4: Run the whole runner suite**

Run: `bun test src/features/testbed/`
Expected: PASS — all tests across every runner test file

- [ ] **Step 5: Commit**

```bash
git add src/features/testbed/__fixtures__/counter.smart.c src/features/testbed/runner/integration.test.ts
git commit -m "test(studio): integration-test the runner against a real contract"
```

---

## Task 12: Worker transport and the watchdog client

**Files:**
- Create: `src/features/testbed/runner/worker.ts`
- Create: `src/features/testbed/runner-client.ts`
- Test: `src/features/testbed/runner-client.test.ts`

A synchronous infinite loop inside a contract blocks the worker's own timers, so the only way to recover is to terminate from outside. The watchdog fires when no event has arrived for a while — which covers both a hanging test and a hang during collection.

- [ ] **Step 1: Write the failing test**

Create `src/features/testbed/runner-client.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { runTests, type RunnerTransport } from "./runner-client";
import type { RunRequest, TestEvent } from "./runner/types";

const emptyRequest: RunRequest = { modules: {}, rawFiles: {}, entryPaths: [] };

/** A transport whose events are driven by the test instead of a real worker. */
function fakeTransport() {
  let listener: (event: TestEvent) => void = () => {};
  const state = { posted: 0, terminated: false };
  const transport: RunnerTransport = {
    post: () => {
      state.posted++;
    },
    onEvent: (l) => {
      listener = l;
    },
    terminate: () => {
      state.terminated = true;
    },
  };
  return { transport, state, send: (e: TestEvent) => listener(e) };
}

describe("runTests", () => {
  it("forwards events and resolves on run:end", async () => {
    const { transport, send } = fakeTransport();
    const seen: TestEvent[] = [];
    const done = runTests(emptyRequest, transport, (e) => seen.push(e));

    send({ type: "test:start", id: "a#0", name: "t", path: ["t"], file: "a" });
    send({ type: "test:end", id: "a#0", status: "passed", durationMs: 1 });
    send({ type: "run:end", durationMs: 2 });

    await done;
    expect(seen.map((e) => e.type)).toEqual(["test:start", "test:end", "run:end"]);
  });

  it("posts the request to the transport", async () => {
    const { transport, state, send } = fakeTransport();
    const done = runTests(emptyRequest, transport, () => {});
    send({ type: "run:end", durationMs: 0 });
    await done;
    expect(state.posted).toBe(1);
  });

  it("terminates the transport when the run ends", async () => {
    const { transport, state, send } = fakeTransport();
    const done = runTests(emptyRequest, transport, () => {});
    send({ type: "run:end", durationMs: 0 });
    await done;
    expect(state.terminated).toBe(true);
  });

  it("times out the in-flight test when the worker stops responding", async () => {
    const { transport, state, send } = fakeTransport();
    const seen: TestEvent[] = [];
    const done = runTests(emptyRequest, transport, (e) => seen.push(e), {
      noProgressTimeoutMs: 30,
    });

    send({ type: "test:start", id: "a#0", name: "hangs", path: ["hangs"], file: "a" });
    // Deliberately send nothing else: the worker is wedged.
    await done;

    const end = seen.find((e) => e.type === "test:end") as any;
    expect(end.id).toBe("a#0");
    expect(end.status).toBe("timedout");
    expect(state.terminated).toBe(true);
    expect(seen[seen.length - 1].type).toBe("run:end");
  });

  it("times out during collection when no test ever starts", async () => {
    const { transport, state } = fakeTransport();
    const seen: TestEvent[] = [];
    await runTests(emptyRequest, transport, (e) => seen.push(e), { noProgressTimeoutMs: 30 });
    expect(seen.map((e) => e.type)).toEqual(["run:end"]);
    expect(state.terminated).toBe(true);
  });

  it("does not time out while events keep arriving", async () => {
    const { transport, send } = fakeTransport();
    const seen: TestEvent[] = [];
    const done = runTests(emptyRequest, transport, (e) => seen.push(e), {
      noProgressTimeoutMs: 40,
    });

    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 20));
      send({ type: "test:end", id: `a#${i}`, status: "passed", durationMs: 1 });
    }
    send({ type: "run:end", durationMs: 60 });
    await done;

    expect(seen.filter((e) => e.type === "test:end").every((e: any) => e.status === "passed")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/testbed/runner-client.test.ts`
Expected: FAIL — cannot find module `./runner-client`

- [ ] **Step 3: Write the client**

Create `src/features/testbed/runner-client.ts`:

```ts
import type { RunRequest, TestEvent } from "./runner/types";

/** How the client talks to whatever is executing the run. */
export interface RunnerTransport {
  post(request: RunRequest): void;
  onEvent(listener: (event: TestEvent) => void): void;
  terminate(): void;
}

export interface RunOptions {
  /** Give up when no event has arrived for this long. Default 5000ms. */
  noProgressTimeoutMs?: number;
}

/**
 * Drives a run and enforces the timeout.
 *
 * The watchdog lives here rather than in the worker because a synchronous loop
 * in a contract blocks the worker's own timers — only an outside observer can
 * notice the silence and terminate.
 */
export function runTests(
  request: RunRequest,
  transport: RunnerTransport,
  emit: (event: TestEvent) => void,
  options: RunOptions = {},
): Promise<void> {
  const budget = options.noProgressTimeoutMs ?? 5000;

  return new Promise((resolve) => {
    let inFlightTestId: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      transport.terminate();
      resolve();
    };

    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (inFlightTestId) {
          emit({ type: "test:end", id: inFlightTestId, status: "timedout", durationMs: budget });
        }
        emit({ type: "run:end", durationMs: budget });
        finish();
      }, budget);
    };

    transport.onEvent((event) => {
      arm();
      if (event.type === "test:start") inFlightTestId = event.id;
      if (event.type === "test:end") inFlightTestId = null;
      emit(event);
      if (event.type === "run:end") finish();
    });

    arm();
    transport.post(request);
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/testbed/runner-client.test.ts`
Expected: PASS, 6 tests

- [ ] **Step 5: Add the worker entry and its transport**

Create `src/features/testbed/runner/worker.ts`:

```ts
import { runRequest } from "./run-request";
import type { RunRequest, TestEvent } from "./types";

// Structured clone handles BigInt, so events need no encoding.
self.onmessage = async (event: MessageEvent<RunRequest>) => {
  await runRequest(event.data, (e: TestEvent) => self.postMessage(e));
};
```

Append to `src/features/testbed/runner-client.ts`:

```ts
/**
 * The real transport: a dedicated worker per run, so a wedged run can be
 * terminated without taking anything else down. Not unit-tested — it is a thin
 * wrapper whose behaviour is the Worker API's.
 */
export function createWorkerTransport(): RunnerTransport {
  const worker = new Worker(new URL("./runner/worker.ts", import.meta.url), { type: "module" });
  return {
    post: (request) => worker.postMessage(request),
    onEvent: (listener) => {
      worker.onmessage = (event: MessageEvent<TestEvent>) => listener(event.data);
    },
    terminate: () => worker.terminate(),
  };
}
```

- [ ] **Step 6: Verify the whole feature suite and the production build**

Run: `bun test src/features/testbed/`
Expected: PASS, all tests

Run: `bun run build`
Expected: build completes with no errors, and the worker is emitted as its own chunk

- [ ] **Step 7: Commit**

```bash
git add src/features/testbed/runner/worker.ts src/features/testbed/runner-client.ts src/features/testbed/runner-client.test.ts
git commit -m "feat(studio): run tests in a worker with a main-thread watchdog"
```

---

## Done criteria

- `bun test src/features/testbed/` passes every test
- `bun run build` succeeds
- The integration test proves a real SmartC contract compiles, runs a scenario, and reports passes and a bigint-diffed failure — entirely in JavaScript, with no Node filesystem access

## What comes next (separate plans)

- **Plan 2 — Editing UI:** `.test.ts` file type, Monaco TypeScript editor, transpilation via Monaco's TS worker, **sourcemap stack mapping** (deferred from this plan), results panel, gutter decorations, typings codegen
- **Plan 3 — The loop:** session→test generator with the pin-expectations dialog, `messageHex` on `ScenarioTx`, recording and the Debug handoff, main-thread debug runs
