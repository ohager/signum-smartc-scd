import * as testbedPkg from "signum-smartc-testbed";
import { createRegistry } from "./module-registry";
import { createRecorder, type TestRecording } from "./recording";
import { createCollector, runSuite } from "./test-api";
import { createTraceSink } from "./trace";
import { instrument } from "../instrument/instrument";
import type { ConsoleLevel, RunRequest, TestEvent } from "./types";
import { serializeValue } from "../serialize-value";

const CONSOLE_LEVELS: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

/** Console output prints a bare string; only nested ones are quoted. */
const formatArg = (value: unknown) => serializeValue(value, { quoteStrings: false });

/**
 * Executes a run request in the current realm. Used by both the worker
 * (normal runs) and the main thread (debug runs, where DevTools can attach).
 */
export async function runRequest(
  request: RunRequest,
  emit: (event: TestEvent) => void,
): Promise<void> {
  const started = Date.now();

  // Attribute console output to whichever test is running when it happens.
  let currentTestId: string | null = null;
  const emitTracked = (event: TestEvent) => {
    if (event.type === "test:start") currentTestId = event.id;
    if (event.type === "test:end") currentTestId = null;
    emit(event);
  };

  const originalConsole = globalThis.console;
  const patched = Object.create(originalConsole) as Console;
  for (const level of CONSOLE_LEVELS) {
    (patched as any)[level] = (...args: unknown[]) => {
      emit({ type: "console", testId: currentTestId, level, text: args.map(formatArg).join(" ") });
    };
  }
  globalThis.console = patched;

  const recordings: Record<string, TestRecording> = {};

  try {
    for (const entry of request.entryPaths) {
      // A fresh collector per file, so suites from one file never leak into another.
      const { api, root } = createCollector(entry);
      const { Recorded, recording } = createRecorder(testbedPkg.SimulatorTestbed as never);
      recordings[entry] = recording;

      const sink = createTraceSink();

      // Instrumentation targets only `request.modules`, which `snapshotProject`
      // fills from the user's project folder — `signum-smartc-testbed` arrives as
      // a virtual, so node_modules is out of reach by construction.
      const instrumented: typeof request.modules = {};
      for (const [path, compiled] of Object.entries(request.modules)) {
        instrumented[path] = { ...compiled, js: instrument(compiled.js, compiled.sourceMap) };
      }

      /** Closes the current trace as each test ends, and starts the next. */
      const emitWithTrace = (event: TestEvent) => {
        if (event.type === "test:end") {
          const { trace, truncated } = sink.endTest();
          emitTracked({ ...event, trace, traceTruncated: truncated });
          return;
        }
        emitTracked(event);
      };

      const registry = createRegistry({
        modules: instrumented,
        rawFiles: request.rawFiles,
        trace: sink,
        virtuals: {
          vitest: api,
          "signum-smartc-testbed": { __esModule: true, ...testbedPkg, SimulatorTestbed: Recorded },
        },
      });

      try {
        registry.require(entry);
      } catch (error) {
        const e = error as Error;
        emitTracked({ type: "collect:error", file: entry, message: e.message, stack: e.stack });
        continue;
      }

      try {
        // `runSuite` should never reject after the hook-failure-containment fix, but
        // `run:end` is the UI's only signal that the run finished, and a future bug
        // in the runner must not be able to strand it — hence this defensive catch.
        await runSuite(root, entry, emitWithTrace);
      } catch (error) {
        const e = error as Error;
        emitTracked({ type: "collect:error", file: entry, message: e.message, stack: e.stack });
      }
    }
  } finally {
    globalThis.console = originalConsole;
  }

  emit({ type: "run:end", durationMs: Date.now() - started, recordings });
}
