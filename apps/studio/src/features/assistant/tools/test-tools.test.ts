import { describe, it, expect, beforeEach } from "bun:test";
import { createTestTools } from "./test-tools";
import { AssistantFailure } from "./errors";
import { createTestFs } from "./test-fs";
import { FileTypes } from "@/features/project/filetype-icons";
import { initialRunState, reduceEvent, type RunState } from "@/features/testbed/test-run-model";
import type { TestEvent } from "@/features/testbed/runner/types";
import type { FileSystem } from "@/lib/file-system/file-system";

let fs: FileSystem;
let testPath: string;

beforeEach(async () => {
  fs = createTestFs().fs;
  const project = await fs.createFolder(fs.rootFolderId, "p");
  await fs.addFile(project, "c.smart.c", FileTypes.SmartC, "long a;");
  const id = await fs.addFile(project, "a.test.ts", FileTypes.Test, "");
  testPath = fs.getFileMetadata(id)!.path;
});

function fold(events: TestEvent[]): RunState {
  return events.reduce(reduceEvent, initialRunState());
}

const failing = (extra: Partial<Extract<TestEvent, { type: "test:end" }>> = {}, logs: string[] = []): RunState =>
  fold([
    { type: "test:start", id: "t#0", name: "adds", path: ["Calc", "adds"], file: testPath },
    ...logs.map((text): TestEvent => ({ type: "console", testId: "t#0", level: "log", text })),
    {
      type: "test:end",
      id: "t#0",
      status: "failed",
      durationMs: 3,
      failure: { message: "expected 1n to be 2n", expected: 2n, actual: 1n, line: 7 },
      ...extra,
    },
    { type: "run:end", durationMs: 9 },
  ]);

function setup(execute: (project: string, options: any) => Promise<RunState>, deadlineMs?: number) {
  const recorded: unknown[] = [];
  const calls: any[] = [];
  const tools = createTestTools({
    fs,
    execute: (project, options) => {
      calls.push({ project, options });
      return execute(project, options);
    },
    recordVerdicts: (...args) => recorded.push(args),
    deadlineMs,
  });
  return { tools, recorded, calls };
}

async function failure(promise: Promise<unknown>): Promise<AssistantFailure> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(AssistantFailure);
    return e as AssistantFailure;
  }
  throw new Error("did not throw");
}

describe("run_tests", () => {
  it("maps a failure compactly", async () => {
    const { tools } = setup(async () => failing());
    const { result } = await tools.run_tests({ project: "p" });

    expect(result).toMatchObject({ passed: 0, failed: 1, skipped: 0, todo: 0, timedout: 0, durationMs: 9, truncated: false });
    expect(result.failures).toEqual([
      { file: testPath, test: ["Calc", "adds"], line: 7, message: "expected 1n to be 2n", expected: "2n", actual: "1n", console: [] },
    ]);
  });

  it("truncates long console output to the last 20 lines of 200 characters", async () => {
    const logs = Array.from({ length: 30 }, (_, n) => `${n}:` + "x".repeat(300));
    const { tools } = setup(async () => failing({}, logs));
    const { result } = await tools.run_tests({ project: "p" });
    const lines = result.failures[0]!.console;
    expect(lines).toHaveLength(20);
    expect(lines[0]!.startsWith("10:")).toBe(true);
    expect(lines.every((l) => l.length <= 200)).toBe(true);
  });

  it("truncates expected and actual to 500 characters", async () => {
    const big = "y".repeat(2000);
    const { tools } = setup(async () =>
      failing({ failure: { message: "m", expected: big, actual: big } }),
    );
    const { result } = await tools.run_tests({ project: "p" });
    expect(result.failures[0]!.expected!.length).toBeLessThanOrEqual(500);
  });

  it("caps failures at 50 and says so", async () => {
    const events: TestEvent[] = [];
    for (let n = 0; n < 60; n++) {
      events.push({ type: "test:start", id: `t#${n}`, name: `n${n}`, path: [`n${n}`], file: testPath });
      events.push({ type: "test:end", id: `t#${n}`, status: "failed", durationMs: 1, failure: { message: "bad" } });
    }
    const { tools } = setup(async () => fold(events));
    const { result } = await tools.run_tests({ project: "p" });
    expect(result.failed).toBe(60);
    expect(result.failures).toHaveLength(50);
    expect(result.truncated).toBe(true);
  });

  it("reports collect and hook errors", async () => {
    const state = fold([
      { type: "collect:error", file: testPath, message: "boom" },
      { type: "hook:error", file: testPath, suite: ["S"], phase: "beforeAll", message: "hook boom" },
      { type: "run:end", durationMs: 1 },
    ]);
    const { tools } = setup(async () => state);
    const { result } = await tools.run_tests({ project: "p" });
    expect(result.collectErrors).toEqual([{ file: testPath, message: "boom" }]);
    expect(result.hookErrors).toEqual([{ file: testPath, message: "hook boom" }]);
  });

  it("records verdicts only for unfiltered runs", async () => {
    const { tools, recorded, calls } = setup(async () => failing());

    await tools.run_tests({ project: "p", test: ["Calc", "adds"] });
    expect(recorded).toHaveLength(0);
    expect(calls[0].options.filter).toEqual(["Calc", "adds"]);

    await tools.run_tests({ project: "p", file: testPath });
    expect(recorded).toHaveLength(1);
    expect(recorded[0]).toMatchObject([expect.any(String), expect.anything(), [testPath]]);
    expect(calls[1].options.entryPath).toBe(testPath);

    await tools.run_tests({ project: "p" });
    expect((recorded[1] as unknown[])[2]).toEqual([]);
  });

  it("rejects a non-test file", async () => {
    const { tools, calls } = setup(async () => failing());
    const e = await failure(tools.run_tests({ project: "p", file: "/p/c.smart.c" }));
    expect(e.code).toBe("path_not_allowed");
    expect(calls).toHaveLength(0);
  });

  it("rejects a test file of another project and a missing one", async () => {
    await fs.createFolder(fs.rootFolderId, "q");
    const { tools } = setup(async () => failing());
    expect((await failure(tools.run_tests({ project: "p", file: "/q/x.test.ts" }))).code).toBe("path_not_allowed");
    expect((await failure(tools.run_tests({ project: "p", file: "/p/nope.test.ts" }))).code).toBe("file_not_found");
  });

  it("rejects an unknown project", async () => {
    const { tools } = setup(async () => failing());
    expect((await failure(tools.run_tests({ project: "zzz" }))).code).toBe("path_not_allowed");
  });

  it("returns timeout when the deadline passes", async () => {
    let aborted = false;
    const { tools, recorded } = setup(
      (_p, { signal }) =>
        new Promise<RunState>((resolve) =>
          signal.addEventListener("abort", () => {
            aborted = true;
            resolve(initialRunState());
          }),
        ),
      20,
    );
    const e = await failure(tools.run_tests({ project: "p" }));
    expect(e.code).toBe("timeout");
    expect(aborted).toBe(true);
    expect(recorded).toHaveLength(0);
  });
});
