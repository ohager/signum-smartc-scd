import * as testbedPkg from "signum-smartc-testbed";
import { createRegistry } from "./module-registry";
import { createCollector, runSuite } from "./test-api";
import type { RunRequest, TestEvent } from "./types";

/**
 * Executes a run request in the current realm. Used by both the worker
 * (normal runs) and the main thread (debug runs, where DevTools can attach).
 */
export async function runRequest(
  request: RunRequest,
  emit: (event: TestEvent) => void,
): Promise<void> {
  const started = Date.now();

  for (const entry of request.entryPaths) {
    // A fresh collector per file, so suites from one file never leak into another.
    const { api, root } = createCollector(entry);
    const registry = createRegistry({
      modules: request.modules,
      rawFiles: request.rawFiles,
      virtuals: {
        vitest: api,
        "signum-smartc-testbed": { __esModule: true, ...testbedPkg },
      },
    });

    try {
      registry.require(entry);
    } catch (error) {
      const e = error as Error;
      emit({ type: "collect:error", file: entry, message: e.message, stack: e.stack });
      continue;
    }

    try {
      // `runSuite` should never reject after the hook-failure-containment fix, but
      // `run:end` is the UI's only signal that the run finished, and a future bug
      // in the runner must not be able to strand it — hence this defensive catch.
      await runSuite(root, entry, emit);
    } catch (error) {
      const e = error as Error;
      emit({ type: "collect:error", file: entry, message: e.message, stack: e.stack });
    }
  }

  emit({ type: "run:end", durationMs: Date.now() - started });
}
