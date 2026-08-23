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
