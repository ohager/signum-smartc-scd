import { useCallback, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import type * as Monaco from "monaco-editor";
import { FileSystem } from "@/lib/file-system";
import { snapshotProject, isTestEntry } from "./project-snapshot";
import { transpileAll } from "./transpile";
import { runTests, createWorkerTransport } from "./runner-client";
import { createMainThreadTransport } from "./main-thread-transport";
import { initialRunState, reduceEvent, type RunState } from "./test-run-model";
import { createLineResolver } from "./line-resolver";
import { detectWrapperOffset } from "./source-position";
import { tracesAtom, activeTestIdAtom, resetTracesAtom } from "./test-trace-store";

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
  /** Run only the test at this name path, e.g. `["Counter", "counts up"]`. */
  filter?: string[];
}

export interface UseTestRun {
  state: RunState;
  isRunning: boolean;
  run: (
    monaco: typeof Monaco,
    projectFolderId: string,
    options?: TestRunOptions,
  ) => Promise<void>;
}

export function useTestRun(): UseTestRun {
  const [state, setState] = useState<RunState>(initialRunState());
  const [isRunning, setIsRunning] = useState(false);
  // Events arrive faster than React commits, so fold against a ref, not state.
  const latest = useRef<RunState>(initialRunState());

  const setTraces = useSetAtom(tracesAtom);
  const setActiveTestId = useSetAtom(activeTestIdAtom);
  const resetTraces = useSetAtom(resetTracesAtom);

  const run = useCallback(
    async (monaco: typeof Monaco, projectFolderId: string, options: TestRunOptions = {}) => {
      const { entryPath, debug, filter } = options;
      setIsRunning(true);
      latest.current = initialRunState();
      setState(latest.current);
      // A new run must never show the previous one's values.
      resetTraces();

      try {
        const fs = FileSystem.getInstance();
        const snapshot = await snapshotProject(fs, projectFolderId);
        const modules = await transpileAll(monaco, snapshot.tsFiles);

        // Stacks come back addressing the transpiled JS inside a `new Function`
        // wrapper; the resolver undoes both to reach the user's line.
        const resolveLine = createLineResolver(modules, detectWrapperOffset());

        const entryPaths = entryPath
          ? [entryPath]
          : Object.keys(snapshot.tsFiles).filter(isTestEntry);

        await runTests(
          { modules, rawFiles: snapshot.rawFiles, entryPaths, filter },
          debug ? createMainThreadTransport() : createWorkerTransport(),
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

            if (event.type === "test:end" && event.trace) {
              const { id, trace } = event;
              setTraces((current) => ({ ...current, [id]: trace }));
              // Land on the first test that produced values, so something is
              // shown without anyone clicking. A failure takes precedence, but
              // that decision needs the whole run, so it is made at run:end.
              setActiveTestId((current) => current ?? id);
            }

            if (event.type === "run:end") {
              // Now that every result is known, prefer the first failure — that
              // is almost always the test the user is here to look at.
              const firstFailure = latest.current.rows.find(
                (row) => row.status === "failed" || row.status === "timedout",
              );
              if (firstFailure) setActiveTestId(firstFailure.id);
            }
          },
          // A debug run is paused at a breakpoint for as long as the user needs,
          // so the no-progress watchdog must not fire. It cannot be disabled with
          // Infinity — browsers clamp that to ~1ms — hence a long finite budget.
          debug ? { noProgressTimeoutMs: 60 * 60 * 1000 } : undefined,
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
    [resetTraces, setTraces, setActiveTestId],
  );

  return { state, isRunning, run };
}
