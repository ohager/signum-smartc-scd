import { expect } from "./expect";
import type { TestEvent, TestFailure, TestMode } from "./types";

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
      stack: new Error().stack,
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
  // chai's AssertionError carries expected/actual; the base Error type does not.
  const e = error as Error & { expected?: unknown; actual?: unknown };
  return { message: e.message, expected: e.expected, actual: e.actual, stack: e.stack };
}

function hasOnly(node: Suite | TestCase): boolean {
  if (node.mode === "only") return true;
  return node.kind === "suite" && node.children.some(hasOnly);
}

function collectTests(node: Suite, into: TestCase[]): TestCase[] {
  for (const child of node.children) {
    if (child.kind === "suite") collectTests(child, into);
    else into.push(child);
  }
  return into;
}

/** Runs a collected suite tree, emitting events as it goes. */
export async function runSuite(
  root: Suite,
  file: string,
  emit: (event: TestEvent) => void,
  filter?: string[],
): Promise<void> {
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

  // An explicit filter is a more specific request than `.only` in the source,
  // so it wins outright rather than intersecting.
  const onlyMode = filter === undefined && hasOnly(root);

  const isPrefix = (prefix: string[], of: string[]) =>
    prefix.length <= of.length && prefix.every((part, at) => part === of[at]);

  /**
   * A suite runs when it is on the same branch as the filter — either an
   * ancestor of it, or inside it. The first keeps the path to a named test
   * open; the second is what makes a whole `describe` runnable as a group.
   */
  function leadsToFilter(path: string[]): boolean {
    if (!filter) return true;
    return isPrefix(path, filter) || isPrefix(filter, path);
  }

  /**
   * A test runs when the filter names it or one of its enclosing suites.
   *
   * A filter as long as the test's path is an exact match, which is the
   * single-test case; a shorter one selects everything beneath it.
   */
  function isFilterTarget(path: string[]): boolean {
    if (!filter) return true;
    return isPrefix(filter, path);
  }

  /** A suite runs when nothing above skipped it and, in only-mode, it is or contains a focused test. */
  function isSuiteSkipped(node: Suite, skipped: boolean, insideOnly: boolean): boolean {
    if (!leadsToFilter(node.path)) return true;
    return skipped || node.mode === "skip" || (onlyMode && !insideOnly && !hasOnly(node));
  }

  /** A test runs when nothing above skipped it and, in only-mode, it is focused or inside a focused suite. */
  function isTestSkipped(test: TestCase, skipped: boolean, withinOnly: boolean): boolean {
    // The filter clause comes first, but `.skip` is still honoured below it: an
    // explicit annotation in the source outranks a click in the gutter.
    if (!isFilterTarget(test.path)) return true;
    return skipped || test.mode === "skip" || (onlyMode && !withinOnly && test.mode !== "only");
  }

  // Reports every test in `node`'s subtree as failed with `failure`, without running
  // anything — used when the suite's own `beforeAll` threw, so none of it ever ran.
  // Respects the same skip/only filtering a normal run would have applied.
  function failTest(test: TestCase, skipped: boolean, withinOnly: boolean, failure: TestFailure) {
    if (test.mode === "todo") {
      emit({ type: "test:end", id: test.id, status: "todo", durationMs: 0 });
      return;
    }
    if (isTestSkipped(test, skipped, withinOnly)) {
      emit({ type: "test:end", id: test.id, status: "skipped", durationMs: 0 });
      return;
    }
    emit({ type: "test:start", id: test.id, name: test.name, path: test.path, file });
    emit({ type: "test:end", id: test.id, status: "failed", durationMs: 0, failure });
  }

  function failSuite(node: Suite, skipped: boolean, withinOnly: boolean, failure: TestFailure) {
    const insideOnly = withinOnly || node.mode === "only";
    const suiteSkipped = isSuiteSkipped(node, skipped, insideOnly);
    for (const child of node.children) {
      if (child.kind === "suite") failSuite(child, suiteSkipped, insideOnly, failure);
      else failTest(child, suiteSkipped, insideOnly, failure);
    }
  }

  async function runNode(
    node: Suite,
    inheritedBeforeEach: Array<Array<() => unknown>>,
    inheritedAfterEach: Array<Array<() => unknown>>,
    skipped: boolean,
    withinOnly: boolean,
  ) {
    // `describe.only` promotes every test inside it, so carry that down the tree.
    const insideOnly = withinOnly || node.mode === "only";
    const suiteSkipped = isSuiteSkipped(node, skipped, insideOnly);

    // A throwing `beforeAll` must not reject `runSuite` (that would strand sibling
    // suites and the final `run:end`). Instead, every test in this subtree is
    // reported failed with the hook's error, and `afterAll` is skipped since it
    // never genuinely ran.
    let beforeAllFailure: TestFailure | undefined;
    if (!suiteSkipped) {
      try {
        for (const hook of node.beforeAll) await hook();
      } catch (error) {
        beforeAllFailure = toFailure(error);
      }
    }

    const beforeEach = [...inheritedBeforeEach, node.beforeEach];
    const afterEach = [node.afterEach, ...inheritedAfterEach];

    for (const child of node.children) {
      if (beforeAllFailure) {
        if (child.kind === "suite") failSuite(child, suiteSkipped, insideOnly, beforeAllFailure);
        else failTest(child, suiteSkipped, insideOnly, beforeAllFailure);
      } else if (child.kind === "suite") {
        await runNode(child, beforeEach, afterEach, suiteSkipped, insideOnly);
      } else {
        await runTest(child, beforeEach, afterEach, suiteSkipped, insideOnly);
      }
    }

    // Tests have already reported by now, so a throwing `afterAll` can only be
    // surfaced as its own event — it must not reject `runSuite` either.
    if (!suiteSkipped && !beforeAllFailure) {
      try {
        for (const hook of node.afterAll) await hook();
      } catch (error) {
        const failure = toFailure(error);
        emit({
          type: "hook:error",
          file,
          suite: node.path,
          phase: "afterAll",
          message: failure.message,
          stack: failure.stack,
        });
      }
    }
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
    if (isTestSkipped(test, skipped, withinOnly)) {
      emit({ type: "test:end", id: test.id, status: "skipped", durationMs: 0 });
      return;
    }

    emit({ type: "test:start", id: test.id, name: test.name, path: test.path, file });
    const started = Date.now();

    // `afterEach` must always run — whether the body passed, threw, or a
    // `beforeEach` threw — so it lives in its own try, separate from the body's.
    // `failed`/`error` track outcome explicitly rather than relying on a caught
    // value's truthiness, since a thrown value (`throw ""`, `throw 0`) can be falsy.
    let failed = false;
    let error: unknown;
    try {
      for (const hooks of beforeEach) for (const hook of hooks) await hook();
      await test.fn();
    } catch (bodyError) {
      failed = true;
      error = bodyError;
    }

    try {
      for (const hooks of afterEach) for (const hook of hooks) await hook();
    } catch (afterEachError) {
      // The first error wins: if the body already failed, keep reporting that one.
      if (!failed) {
        failed = true;
        error = afterEachError;
      }
    }

    if (failed) {
      emit({
        type: "test:end",
        id: test.id,
        status: "failed",
        durationMs: Date.now() - started,
        failure: toFailure(error),
      });
    } else {
      emit({ type: "test:end", id: test.id, status: "passed", durationMs: Date.now() - started });
    }
  }

  await runNode(root, [], [], false, false);
}
