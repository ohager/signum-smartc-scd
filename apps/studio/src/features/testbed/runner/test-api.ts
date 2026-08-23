import { expect } from "./expect";
import type { TestEvent, TestFailure, TestMode } from "./types";

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

function toFailure(error: unknown): TestFailure {
  if (!(error instanceof Error)) return { message: String(error) };
  const e = error as Error & { expected?: unknown; actual?: unknown };
  return { message: e.message, expected: e.expected, actual: e.actual, stack: e.stack };
}

function hasOnly(node: Suite | TestCase): boolean {
  if (node.mode === "only") return true;
  return node.kind === "suite" && node.children.some(hasOnly);
}

/** Runs a collected suite tree, emitting events as it goes. */
export async function runSuite(
  root: Suite,
  file: string,
  emit: (event: TestEvent) => void,
): Promise<void> {
  const onlyMode = hasOnly(root);

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
    if (!suiteSkipped) for (const hook of node.beforeAll) await hook();

    const beforeEach = [...inheritedBeforeEach, node.beforeEach];
    const afterEach = [node.afterEach, ...inheritedAfterEach];

    for (const child of node.children) {
      if (child.kind === "suite") await runNode(child, beforeEach, afterEach, suiteSkipped, insideOnly);
      else await runTest(child, beforeEach, afterEach, suiteSkipped, insideOnly);
    }

    if (!suiteSkipped) for (const hook of node.afterAll) await hook();
  }

  async function runTest(
    test: TestCase,
    beforeEach: Array<Array<() => unknown>>,
    afterEach: Array<Array<() => unknown>>,
    skipped: boolean,
    withinOnly: boolean,
  ) {
    if (test.mode === "todo") {
      emit({ type: "test:end", id: test.id, status: "todo", durationMs: 0 });
      return;
    }
    if (skipped || test.mode === "skip" || (onlyMode && !withinOnly && test.mode !== "only")) {
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

  await runNode(root, [], [], false, false);
}
