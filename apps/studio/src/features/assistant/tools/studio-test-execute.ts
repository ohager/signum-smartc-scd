import { loader } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { FileSystem } from "@/lib/file-system";
import { jotaiStore } from "@/stores/jotai-store";
import { executeTestRun } from "@/features/testbed/execute-test-run";
import { transpileAll } from "@/features/testbed/transpile";
import { createWorkerTransport } from "@/features/testbed/runner-client";
import { detectWrapperOffset } from "@/features/testbed/source-position";
import { latestRunAtom } from "@/features/testbed/test-trace-store";
import { recordTestVerdicts } from "@/features/testbed/test-verdicts";
import type { TestToolDeps } from "./test-tools";

/*
 * The app-side wiring of `run_tests` (connected in Task 16). Kept out of
 * test-tools.ts because it pulls in Monaco and the jotai store, neither of which
 * loads under `bun test`; like `createWorkerTransport` it is a thin wrapper
 * over browser APIs and is not unit-tested.
 */

/** The real `execute`: the editor's pipeline, publishing its result for an open test editor to show. */
export function createStudioTestExecute(): TestToolDeps["execute"] {
  return async (projectFolderId, options) => {
    // The editor may never have been opened, so Monaco is loaded on demand.
    const monaco = (await loader.init()) as unknown as typeof Monaco;
    const state = await executeTestRun(
      {
        fs: FileSystem.getInstance(),
        transpile: (files) => transpileAll(monaco, files),
        transport: createWorkerTransport(),
        resolveWrapperOffset: detectWrapperOffset,
      },
      projectFolderId,
      options,
      (next) => {
        // Published while it runs so the panel fills live, like a run the user started.
        jotaiStore.set(latestRunAtom, {
          projectFolderId,
          entryPaths: options.entryPath ? [options.entryPath] : [],
          state: next,
          at: Date.now(),
          source: "assistant",
        });
      },
    );
    return state;
  };
}

/** The real `recordVerdicts`: the same writer the test editor uses. */
export function createStudioRecordVerdicts(): TestToolDeps["recordVerdicts"] {
  return (projectId, state, entryPaths) => recordTestVerdicts(FileSystem.getInstance(), projectId, state, entryPaths);
}
