import { describe, it, expect } from "bun:test";
import { createStore } from "jotai";
import {
  tracesAtom,
  activeTestIdAtom,
  activeTraceAtom,
  fileTraceAtom,
  resetTracesAtom,
  inspectedLineAtom,
  inspectedValueAtom,
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
    expect(store.get(fileTraceAtom)(HELPER)).toEqual({
      4: { values: ["7n"], count: 1, name: "inner" },
    });
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

describe("inspected line", () => {
  it("has nothing inspected initially", () => {
    const store = createStore();
    expect(store.get(inspectedValueAtom)).toBeUndefined();
  });

  it("resolves the inspected line to its trace in the active test", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    store.set(activeTestIdAtom, "a#1");
    store.set(inspectedLineAtom, { file: HELPER, line: 4 });
    expect(store.get(inspectedValueAtom)).toEqual({
      file: HELPER,
      line: 4,
      trace: { values: ["7n"], count: 1, name: "inner" },
    });
  });

  it("resolves to nothing when the active test never touched that line", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    store.set(activeTestIdAtom, "a#0");
    store.set(inspectedLineAtom, { file: HELPER, line: 4 });
    expect(store.get(inspectedValueAtom)).toBeUndefined();
  });

  it("follows the active test, so switching tests re-resolves the same line", () => {
    const store = createStore();
    store.set(tracesAtom, traces);
    store.set(activeTestIdAtom, "a#1");
    store.set(inspectedLineAtom, { file: TEST_FILE, line: 9 });
    expect(store.get(inspectedValueAtom)?.trace.name).toBe("y");

    store.set(activeTestIdAtom, "a#0");
    expect(store.get(inspectedValueAtom)).toBeUndefined();
  });

  it("is cleared when a new run starts", () => {
    const store = createStore();
    store.set(inspectedLineAtom, { file: TEST_FILE, line: 9 });
    store.set(resetTracesAtom);
    expect(store.get(inspectedLineAtom)).toBeNull();
  });
});
