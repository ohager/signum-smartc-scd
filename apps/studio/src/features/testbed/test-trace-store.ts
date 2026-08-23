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
