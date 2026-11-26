import type { ToolArgs } from "@smartc-studio/assistant-protocol";
import { serializeValue } from "@/features/testbed/serialize-value";
import type { TestRunOptions } from "@/features/testbed/execute-test-run";
import type { RunState } from "@/features/testbed/test-run-model";
import { AssistantFailure } from "./errors";
import { truncate } from "./format";
import { resolveProject, resolveWorkspacePath, type WorkspaceFs } from "./paths";

/* Spec §9: one overall deadline for the whole call, whatever the run is doing. */
export const RUN_TESTS_DEADLINE_MS = 120_000;
const MAX_FAILURES = 50;
const MAX_CONSOLE_LINES = 20;
const MAX_CONSOLE_CHARS = 200;
const MAX_VALUE_CHARS = 500;

export interface TestToolDeps {
  fs: WorkspaceFs;
  /* The Studio's shared pipeline (see `createStudioTestExecute`); a fake in tests. */
  execute: (projectFolderId: string, options: TestRunOptions & { signal: AbortSignal }) => Promise<RunState>;
  recordVerdicts: (projectId: string, state: RunState, entryPaths: string[]) => void;
  /* Injectable so the timeout test does not wait two minutes. */
  deadlineMs?: number;
}

export interface TestFailureSummary {
  file: string;
  test: string[];
  line?: number;
  message: string;
  expected?: string;
  actual?: string;
  console: string[];
}

export interface RunTestsResult {
  passed: number;
  failed: number;
  skipped: number;
  todo: number;
  timedout: number;
  durationMs: number;
  collectErrors: { file: string; message: string }[];
  hookErrors: { file: string; message: string }[];
  failures: TestFailureSummary[];
  truncated: boolean;
}

function summarizeFailure(row: RunState["rows"][number]): TestFailureSummary {
  const failure = row.failure;
  const console = row.logs
    .slice(-MAX_CONSOLE_LINES)
    .map((l) => truncate(l.level === "log" ? l.text : `[${l.level}] ${l.text}`, MAX_CONSOLE_CHARS).text);

  const summary: TestFailureSummary = {
    file: row.file,
    test: row.path,
    // A timeout has no failure record: the watchdog ended the test, not an assertion.
    message: failure?.message ?? "The test made no progress and was stopped.", // i18n-ignore
    console,
  };
  if (failure?.line !== undefined) summary.line = failure.line;
  if (failure && "expected" in failure && failure.expected !== undefined) {
    summary.expected = truncate(serializeValue(failure.expected), MAX_VALUE_CHARS).text;
  }
  if (failure && "actual" in failure && failure.actual !== undefined) {
    summary.actual = truncate(serializeValue(failure.actual), MAX_VALUE_CHARS).text;
  }
  return summary;
}

export function createTestTools(deps: TestToolDeps) {
  const { fs } = deps;

  /* Only a `.test.ts` inside the named project is a valid entry; the agent learns the rule from the error. */
  function testFileIn(projectId: string, path: string): string {
    const resolved = resolveWorkspacePath(fs, path, "read");
    if (resolved.projectId !== projectId) {
      throw new AssistantFailure("path_not_allowed", `${path} is not in the project being tested.`);
    }
    if (!resolved.name.toLowerCase().endsWith(".test.ts")) {
      throw new AssistantFailure("path_not_allowed", `"${resolved.name}" is not a test file.`, "Only .test.ts files can be run.");
    }
    if (!resolved.fileId) throw new AssistantFailure("file_not_found", `No file at ${path}.`);
    // The metadata path is what the project snapshot keys files by.
    return fs.getFileMetadata(resolved.fileId)?.path ?? path;
  }

  return {
    async run_tests(args: ToolArgs<"run_tests">): Promise<{ result: RunTestsResult }> {
      const projectId = resolveProject(fs, args.project);
      const entryPath = args.file ? testFileIn(projectId, args.file) : undefined;

      const controller = new AbortController();
      let timer: ReturnType<typeof setTimeout> | undefined;
      /*
       * Raced rather than trusting `execute` to honour the signal: snapshot and
       * transpile run before the runner sees it, and the agent must get its
       * answer on time regardless. The abort still stops a running worker.
       */
      const deadline = new Promise<"deadline">((resolve) => {
        timer = setTimeout(() => {
          controller.abort();
          resolve("deadline");
        }, deps.deadlineMs ?? RUN_TESTS_DEADLINE_MS);
      });

      const run = deps.execute(projectId, { entryPath, filter: args.test, signal: controller.signal });
      run.catch(() => {}); // a late rejection after the deadline must not go unhandled

      let outcome: RunState | "deadline";
      try {
        outcome = await Promise.race([run, deadline]);
      } finally {
        clearTimeout(timer);
      }
      if (outcome === "deadline" || controller.signal.aborted) {
        throw new AssistantFailure(
          "timeout",
          `The tests did not finish within ${(deps.deadlineMs ?? RUN_TESTS_DEADLINE_MS) / 1000} seconds and were stopped.`,
          "Run a single file with `file` or a single test with `test`; a test may be stuck in a loop.",
        );
      }
      const state = outcome;

      /* A filtered run's counts describe one test; filing them would misreport the file (as the test editor knows). */
      if (!args.test) deps.recordVerdicts(projectId, state, entryPath ? [entryPath] : []);

      const failedRows = state.rows.filter((r) => r.status === "failed" || r.status === "timedout");
      return {
        result: {
          ...state.counts,
          durationMs: state.durationMs ?? 0,
          collectErrors: state.collectErrors.map(({ file, message }) => ({ file, message })),
          hookErrors: state.hookErrors.map(({ file, message }) => ({ file, message })),
          failures: failedRows.slice(0, MAX_FAILURES).map(summarizeFailure),
          truncated: failedRows.length > MAX_FAILURES,
        },
      };
    },
  };
}

export type TestTools = ReturnType<typeof createTestTools>;
