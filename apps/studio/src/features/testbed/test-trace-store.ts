import { atom } from "jotai";
import type { FileTrace, LineTrace, TestTrace } from "./runner/trace";
import type { RunState } from "./test-run-model";

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

/** Where in the project the Value tab is pointed, set by clicking an annotation. */
export const inspectedLineAtom = atom<{ file: string; line: number } | null>(null);

export interface InspectedValue {
  file: string;
  line: number;
  trace: LineTrace;
}

/**
 * The inspected line resolved against the active test.
 *
 * Deliberately derived rather than stored: switching to a different test
 * re-answers the same question for that test, and a line the new test never
 * reached correctly resolves to nothing instead of showing a stale value.
 */
export const inspectedValueAtom = atom<InspectedValue | undefined>((get) => {
  const target = get(inspectedLineAtom);
  if (!target) return undefined;
  const trace = get(activeTraceAtom)?.[target.file]?.[target.line];
  return trace ? { file: target.file, line: target.line, trace } : undefined;
});

/** Clears everything. Called when a run starts, so stale values never linger. */
export const resetTracesAtom = atom(null, (_get, set) => {
  set(tracesAtom, {});
  set(activeTestIdAtom, null);
  set(inspectedLineAtom, null);
});

export interface LatestRun {
  projectFolderId: string;
  /** Test files the run covered. Empty means every test file in the project. */
  entryPaths: string[];
  state: RunState;
  at: number;
  source: "user" | "assistant";
}

/**
 * The most recent run that did not start in a test editor — today, the
 * assistant's. A test editor that covers the run's files shows it, so what the
 * agent ran is visible exactly like a run the user pressed.
 */
export const latestRunAtom = atom<LatestRun | null>(null);
