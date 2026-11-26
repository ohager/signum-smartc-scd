import { snapshotProject, isTestEntry, type SnapshotSource } from "./project-snapshot";
import { runTests, type RunnerTransport } from "./runner-client";
import { initialRunState, reduceEvent, type RunState } from "./test-run-model";
import { createLineResolver } from "./line-resolver";
import type { CompiledModule, TestEvent } from "./runner/types";

/**
 * Named `TestRunOptions`, not `RunOptions`: `runner-client.ts` already exports a
 * `RunOptions` for the watchdog budget, and two unrelated types under one name
 * in the same feature is a trap.
 */
export interface TestRunOptions {
  /** One `*.test.ts` to run. Omitted, every test file in the project runs. */
  entryPath?: string;
  /**
   * Run on the main thread so DevTools can attach. See `main-thread-transport.ts`.
   * Acted on by the caller that builds the transport, not by `executeTestRun`.
   */
  debug?: boolean;
  /** Run only the test at this name path, e.g. `["Counter", "counts up"]`. */
  filter?: string[];
}

export interface ExecuteTestRunDeps {
  fs: SnapshotSource;
  /**
   * Injected because the real one needs Monaco's TypeScript worker, i.e. a
   * browser. Tests pass an identity transpile over JavaScript-only modules.
   */
  transpile: (files: Record<string, string>) => Promise<Record<string, CompiledModule>>;
  transport: RunnerTransport;
  resolveWrapperOffset: () => number;
}

export interface ExecuteTestRunOptions extends TestRunOptions {
  signal?: AbortSignal;
  noProgressTimeoutMs?: number;
  /**
   * Sees every event after enrichment and after `onState`. For side effects that
   * need individual events (the trace store) rather than the folded state.
   */
  onEvent?: (event: TestEvent) => void;
}

/**
 * The whole test-run pipeline minus any UI: snapshot, transpile, run, enrich,
 * fold. The test editor and the assistant's `run_tests` both go through here, so
 * an agent run is exactly what the user would have got by pressing Run.
 *
 * Never rejects: a failure in the harness (snapshot or transpile) is reported as
 * a file-level `collect:error` followed by `run:end`, like a failure to collect.
 */
export async function executeTestRun(
  deps: ExecuteTestRunDeps,
  projectFolderId: string,
  options: ExecuteTestRunOptions,
  onState: (state: RunState) => void,
): Promise<RunState> {
  const { entryPath, filter, signal, noProgressTimeoutMs, onEvent } = options;
  // Events arrive faster than any consumer renders, so fold against a local.
  let latest = initialRunState();
  onState(latest);

  const apply = (event: TestEvent) => {
    latest = reduceEvent(latest, event);
    onState(latest);
  };

  try {
    const snapshot = await snapshotProject(deps.fs, projectFolderId);
    const modules = await deps.transpile(snapshot.tsFiles);

    // Stacks come back addressing the transpiled JS inside a `new Function`
    // wrapper; the resolver undoes both to reach the user's line.
    const resolveLine = createLineResolver(modules, deps.resolveWrapperOffset());

    const entryPaths = entryPath
      ? [entryPath]
      : Object.keys(snapshot.tsFiles).filter(isTestEntry);

    await runTests(
      { modules, rawFiles: snapshot.rawFiles, entryPaths, filter },
      deps.transport,
      (event) => {
        const enriched: TestEvent =
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

        apply(enriched);
        onEvent?.(enriched);
      },
      { noProgressTimeoutMs, signal },
    );
  } catch (error) {
    // The transport may already exist (a worker is spawned before the snapshot),
    // and only `runTests` terminates it on the normal path.
    deps.transport.terminate();
    const e = error as Error;
    apply({ type: "collect:error", file: entryPath ?? "(project)", message: e.message, stack: e.stack });
    apply({ type: "run:end", durationMs: 0 });
  }

  return latest;
}
