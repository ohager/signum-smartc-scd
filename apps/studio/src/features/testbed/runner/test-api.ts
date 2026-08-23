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
