import { useCallback, useRef, useState } from "react";
import { useSetAtom } from "jotai";
import type * as Monaco from "monaco-editor";
import { FileSystem } from "@/lib/file-system";
import { transpileAll } from "./transpile";
import { createWorkerTransport } from "./runner-client";
import { createMainThreadTransport } from "./main-thread-transport";
import { initialRunState, type RunState } from "./test-run-model";
import { detectWrapperOffset } from "./source-position";
import { executeTestRun, type TestRunOptions } from "./execute-test-run";
import {
  tracesAtom,
  activeTestIdAtom,
  resetTracesAtom,
} from "./test-trace-store";

export type { TestRunOptions };

export interface UseTestRun {
  state: RunState;
  isRunning: boolean;
  /**
   * Resolves with the state the run ended in. `state` reaches the caller a
   * render later, which is too late for anyone who wants to act on a recording
   * the moment it exists.
   */
  run: (
    monaco: typeof Monaco,
    projectFolderId: string,
    options?: TestRunOptions,
  ) => Promise<RunState>;
}

export function useTestRun(): UseTestRun {
  const [state, setState] = useState<RunState>(initialRunState());
  const [isRunning, setIsRunning] = useState(false);
  // The pipeline folds events itself; the ref holds what it last reported so
  // the trace handler below can look at the whole run at `run:end`.
  const latest = useRef<RunState>(initialRunState());

  const setTraces = useSetAtom(tracesAtom);
  const setActiveTestId = useSetAtom(activeTestIdAtom);
  const resetTraces = useSetAtom(resetTracesAtom);

  const run = useCallback(
    async (
      monaco: typeof Monaco,
      projectFolderId: string,
      options: TestRunOptions = {},
    ) => {
      const { entryPath, debug, filter } = options;
      setIsRunning(true);
      latest.current = initialRunState();
      setState(latest.current);
      // A new run must never show the previous one's values.
      resetTraces();

      try {
        return await executeTestRun(
          {
            fs: FileSystem.getInstance(),
            transpile: (files) => transpileAll(monaco, files),
            transport: debug ? createMainThreadTransport() : createWorkerTransport(),
            resolveWrapperOffset: detectWrapperOffset,
          },
          projectFolderId,
          {
            entryPath,
            filter,
            // A debug run is paused at a breakpoint for as long as the user needs,
            // so the no-progress watchdog must not fire. It cannot be disabled with
            // Infinity — browsers clamp that to ~1ms — hence a long finite budget.
            noProgressTimeoutMs: debug ? 60 * 60 * 1000 : undefined,
            onEvent: (event) => {
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
          },
          (next) => {
            latest.current = next;
            setState(next);
          },
        );
      } finally {
        setIsRunning(false);
      }
    },
    [resetTraces, setTraces, setActiveTestId],
  );

  return { state, isRunning, run };
}
