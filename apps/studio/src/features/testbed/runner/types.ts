import type { TestRecording } from "./recording";

/** A TypeScript project file after transpilation to CommonJS. */
export interface CompiledModule {
  js: string;
  sourceMap?: string;
}

/** Everything the runner needs to execute a set of test files. */
export interface RunRequest {
  /** VFS path → transpiled CommonJS. */
  modules: Record<string, CompiledModule>;
  /** VFS path → raw text, served to `?raw` imports (contract sources). */
  rawFiles: Record<string, string>;
  /** VFS paths of the test files to run. */
  entryPaths: string[];
}

export type TestMode = "run" | "skip" | "todo" | "only";

/** `timedout` is produced by the client watchdog, never by the runner itself. */
export type TestStatus = "passed" | "failed" | "skipped" | "todo" | "timedout";

export interface TestFailure {
  message: string;
  expected?: unknown;
  actual?: unknown;
  stack?: string;
  /** 1-based source line, filled in by the client after mapping. */
  line?: number;
}

export type ConsoleLevel = "log" | "info" | "warn" | "error" | "debug";

export type TestEvent =
  | { type: "run:plan"; file: string; tests: { id: string; name: string; path: string[]; stack?: string; line?: number }[] }
  | { type: "test:start"; id: string; name: string; path: string[]; file: string }
  | { type: "test:end"; id: string; status: TestStatus; durationMs: number; failure?: TestFailure }
  | { type: "console"; testId: string | null; level: ConsoleLevel; text: string }
  | { type: "collect:error"; file: string; message: string; stack?: string }
  | { type: "hook:error"; file: string; suite: string[]; phase: "beforeAll" | "afterAll"; message: string; stack?: string }
  | { type: "run:end"; durationMs: number; recordings?: Record<string, TestRecording> };
