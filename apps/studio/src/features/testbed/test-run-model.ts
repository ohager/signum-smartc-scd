import type { ConsoleLevel, TestEvent, TestFailure, TestStatus } from "./runner/types";

export interface LogLine {
  level: ConsoleLevel;
  text: string;
}

export interface TestRow {
  id: string;
  name: string;
  path: string[];
  file: string;
  status: TestStatus | "running";
  durationMs?: number;
  failure?: TestFailure;
  logs: LogLine[];
}

export interface RunState {
  status: "idle" | "running" | "done";
  rows: TestRow[];
  /** Row index by test id, so folding stays O(1) per event. */
  index: Record<string, number>;
  /** Output emitted outside any test — during collection or hooks. */
  logs: LogLine[];
  collectErrors: { file: string; message: string }[];
  hookErrors: { file: string; suite: string[]; phase: string; message: string }[];
  counts: Record<"passed" | "failed" | "skipped" | "todo" | "timedout", number>;
  durationMs?: number;
}

export function initialRunState(): RunState {
  return {
    status: "idle",
    rows: [],
    index: {},
    logs: [],
    collectErrors: [],
    hookErrors: [],
    counts: { passed: 0, failed: 0, skipped: 0, todo: 0, timedout: 0 },
  };
}

/**
 * Folds one event into the run state.
 *
 * Skipped and todo tests emit `test:end` with no preceding `test:start`, so a
 * row may have to be created here with only an id to identify it.
 */
export function reduceEvent(state: RunState, event: TestEvent): RunState {
  switch (event.type) {
    case "test:start": {
      const rows = [
        ...state.rows,
        {
          id: event.id,
          name: event.name,
          path: event.path,
          file: event.file,
          status: "running" as const,
          logs: [],
        },
      ];
      return {
        ...state,
        status: "running",
        rows,
        index: { ...state.index, [event.id]: rows.length - 1 },
      };
    }

    case "test:end": {
      const rows = [...state.rows];
      let at = state.index[event.id];
      let index = state.index;

      if (at === undefined) {
        // Skipped/todo tests never start, so the row appears for the first time here.
        rows.push({
          id: event.id,
          name: event.id.split("#")[0] ?? event.id,
          path: [],
          file: event.id.split("#")[0] ?? "",
          status: event.status,
          logs: [],
        });
        at = rows.length - 1;
        index = { ...index, [event.id]: at };
      }

      rows[at] = {
        ...rows[at],
        status: event.status,
        durationMs: event.durationMs,
        failure: event.failure,
      };

      return {
        ...state,
        status: "running",
        rows,
        index,
        counts: { ...state.counts, [event.status]: state.counts[event.status] + 1 },
      };
    }

    case "console": {
      const line = { level: event.level, text: event.text };
      if (event.testId === null) return { ...state, logs: [...state.logs, line] };
      const at = state.index[event.testId];
      if (at === undefined) return { ...state, logs: [...state.logs, line] };
      const rows = [...state.rows];
      rows[at] = { ...rows[at], logs: [...rows[at].logs, line] };
      return { ...state, rows };
    }

    case "collect:error":
      return {
        ...state,
        collectErrors: [...state.collectErrors, { file: event.file, message: event.message }],
      };

    case "hook:error":
      return {
        ...state,
        hookErrors: [
          ...state.hookErrors,
          { file: event.file, suite: event.suite, phase: event.phase, message: event.message },
        ],
      };

    case "run:end":
      return { ...state, status: "done", durationMs: event.durationMs };
  }
}
