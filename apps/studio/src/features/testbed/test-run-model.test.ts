import { describe, it, expect } from "bun:test";
import { initialRunState, reduceEvent, type RunState } from "./test-run-model";
import type { TestEvent } from "./runner/types";

const fold = (events: TestEvent[]): RunState => events.reduce(reduceEvent, initialRunState());

const started: TestEvent = {
  type: "test:start",
  id: "a#0",
  name: "works",
  path: ["suite", "works"],
  file: "/a.test.ts",
};

describe("test-run-model", () => {
  it("starts idle and empty", () => {
    const s = initialRunState();
    expect(s.status).toBe("idle");
    expect(s.rows).toEqual([]);
  });

  it("adds a running row on test:start", () => {
    const s = fold([started]);
    expect(s.status).toBe("running");
    expect(s.rows[0]).toMatchObject({ id: "a#0", name: "works", status: "running" });
  });

  it("completes the row on test:end", () => {
    const s = fold([started, { type: "test:end", id: "a#0", status: "passed", durationMs: 7 }]);
    expect(s.rows[0]).toMatchObject({ status: "passed", durationMs: 7 });
    expect(s.counts.passed).toBe(1);
  });

  it("records a failure with its diff payload", () => {
    const s = fold([
      started,
      {
        type: "test:end",
        id: "a#0",
        status: "failed",
        durationMs: 3,
        failure: { message: "expected 2n to be 99n", expected: 99n, actual: 2n },
      },
    ]);
    expect(s.rows[0].failure?.expected).toBe(99n);
    expect(s.counts.failed).toBe(1);
  });

  it("creates a row for a skipped test that never started", () => {
    const s = fold([{ type: "test:end", id: "a#1", status: "skipped", durationMs: 0 }]);
    expect(s.rows[0]).toMatchObject({ id: "a#1", status: "skipped" });
    expect(s.counts.skipped).toBe(1);
  });

  it("attaches console output to the test that produced it", () => {
    const s = fold([
      started,
      { type: "console", testId: "a#0", level: "log", text: "hello" },
      { type: "test:end", id: "a#0", status: "passed", durationMs: 1 },
    ]);
    expect(s.rows[0].logs).toEqual([{ level: "log", text: "hello" }]);
  });

  it("keeps console output with no test as run-level output", () => {
    const s = fold([{ type: "console", testId: null, level: "warn", text: "at import time" }]);
    expect(s.logs).toEqual([{ level: "warn", text: "at import time" }]);
  });

  it("records collection errors per file", () => {
    const s = fold([{ type: "collect:error", file: "/a.test.ts", message: "boom" }]);
    expect(s.collectErrors).toEqual([{ file: "/a.test.ts", message: "boom" }]);
  });

  it("records hook errors", () => {
    const s = fold([
      {
        type: "hook:error",
        file: "/a.test.ts",
        suite: ["outer"],
        phase: "afterAll",
        message: "cleanup blew up",
      },
    ]);
    expect(s.hookErrors[0]).toMatchObject({ phase: "afterAll", message: "cleanup blew up" });
  });

  it("finishes on run:end", () => {
    const s = fold([started, { type: "test:end", id: "a#0", status: "passed", durationMs: 1 }, { type: "run:end", durationMs: 12 }]);
    expect(s.status).toBe("done");
    expect(s.durationMs).toBe(12);
  });

  it("carries recordings from run:end into state", () => {
    const s = fold([
      started,
      { type: "test:end", id: "a#0", status: "passed", durationMs: 1 },
      {
        type: "run:end",
        durationMs: 12,
        recordings: { "/a.test.ts": { allContractSources: ["int main(){}"], transactions: [] } },
      },
    ]);
    expect(s.recordings).toEqual({ "/a.test.ts": { allContractSources: ["int main(){}"], transactions: [] } });
  });

  it("leaves recordings undefined when run:end carries none", () => {
    const s = fold([started, { type: "test:end", id: "a#0", status: "passed", durationMs: 1 }, { type: "run:end", durationMs: 12 }]);
    expect(s.recordings).toBeUndefined();
  });

  it("counts a timeout as its own outcome", () => {
    const s = fold([started, { type: "test:end", id: "a#0", status: "timedout", durationMs: 5000 }]);
    expect(s.counts.timedout).toBe(1);
  });

  it("pre-creates pending rows from the run plan", () => {
    const s = fold([
      {
        type: "run:plan",
        file: "/a.test.ts",
        tests: [
          { id: "a#0", name: "one", path: ["s", "one"] },
          { id: "a#1", name: "two", path: ["s", "two"] },
        ],
      },
    ]);
    expect(s.rows.map((r) => r.status)).toEqual(["pending", "pending"]);
    expect(s.rows[1]).toMatchObject({ id: "a#1", name: "two", file: "/a.test.ts" });
  });

  it("updates the planned row rather than adding a second one", () => {
    const s = fold([
      { type: "run:plan", file: "/a.test.ts", tests: [{ id: "a#0", name: "one", path: ["one"] }] },
      { type: "test:start", id: "a#0", name: "one", path: ["one"], file: "/a.test.ts" },
      { type: "test:end", id: "a#0", status: "passed", durationMs: 4 },
    ]);
    expect(s.rows).toHaveLength(1);
    expect(s.rows[0]).toMatchObject({ status: "passed", durationMs: 4 });
  });

  it("gives a skipped test its real name, not a synthesised one", () => {
    const s = fold([
      { type: "run:plan", file: "/a.test.ts", tests: [{ id: "a#0", name: "skipped one", path: ["s", "skipped one"] }] },
      { type: "test:end", id: "a#0", status: "skipped", durationMs: 0 },
    ]);
    expect(s.rows[0].name).toBe("skipped one");
    expect(s.rows[0].path).toEqual(["s", "skipped one"]);
  });

  it("keeps a line supplied with the plan", () => {
    const s = fold([
      {
        type: "run:plan",
        file: "/a.test.ts",
        tests: [{ id: "a#0", name: "one", path: ["one"], line: 12 }],
      },
    ]);
    expect(s.rows[0].line).toBe(12);
  });
});
