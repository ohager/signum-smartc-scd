import * as testbedPkg from "signum-smartc-testbed";
import { createRegistry } from "./module-registry";
import { createCollector, runSuite } from "./test-api";
import type { ConsoleLevel, RunRequest, TestEvent } from "./types";

const CONSOLE_LEVELS: ConsoleLevel[] = ["log", "info", "warn", "error", "debug"];

function formatArg(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)) ?? String(value);
  } catch {
    return String(value);
  }
}

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

  try {
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
        emitTracked({ type: "collect:error", file: entry, message: e.message, stack: e.stack });
        continue;
      }

      try {
        // `runSuite` should never reject after the hook-failure-containment fix, but
        // `run:end` is the UI's only signal that the run finished, and a future bug
        // in the runner must not be able to strand it — hence this defensive catch.
        await runSuite(root, entry, emitTracked);
      } catch (error) {
        const e = error as Error;
        emitTracked({ type: "collect:error", file: entry, message: e.message, stack: e.stack });
      }
    }
  } finally {
    globalThis.console = originalConsole;
  }

  emit({ type: "run:end", durationMs: Date.now() - started });
}
