import { describe, it, expect } from "bun:test";
import { testVerdictsByFile, recordTestVerdicts } from "./test-verdicts";
import { initialRunState, reduceEvent, type RunState } from "./test-run-model";
import type { TestEvent } from "./runner/types";
import { createTestFs } from "@/features/assistant/tools/test-fs";
import { FileTypes } from "@/features/project/filetype-icons";

function stateOf(results: [file: string, status: "passed" | "failed" | "timedout" | "skipped"][]): RunState {
  let state = initialRunState();
  results.forEach(([file, status], n) => {
    const id = `${file}#${n}`;
    const events: TestEvent[] = [
      { type: "test:start", id, name: `t${n}`, path: [`t${n}`], file },
      { type: "test:end", id, status, durationMs: 1 },
    ];
    for (const event of events) state = reduceEvent(state, event);
  });
  return state;
}

describe("testVerdictsByFile", () => {
  it("counts passed and failed per file", () => {
    const state = stateOf([
      ["/p/a.test.ts", "passed"],
      ["/p/a.test.ts", "failed"],
      ["/p/b.test.ts", "passed"],
    ]);
    expect(testVerdictsByFile(state, ["/p/a.test.ts", "/p/b.test.ts"])).toEqual({
      "/p/a.test.ts": { passed: 1, failed: 1 },
      "/p/b.test.ts": { passed: 1, failed: 0 },
    });
  });

  it("counts timeouts as failures and ignores skipped tests", () => {
    const state = stateOf([
      ["/p/a.test.ts", "timedout"],
      ["/p/a.test.ts", "skipped"],
    ]);
    expect(testVerdictsByFile(state, ["/p/a.test.ts"])).toEqual({ "/p/a.test.ts": { passed: 0, failed: 1 } });
  });

  it("reports an entry file that produced no rows as zero/zero", () => {
    expect(testVerdictsByFile(initialRunState(), ["/p/a.test.ts"])).toEqual({ "/p/a.test.ts": { passed: 0, failed: 0 } });
  });
});

describe("recordTestVerdicts", () => {
  it("files a verdict per test file with the modification times of file and contract", async () => {
    const { fs } = createTestFs();
    const project = await fs.createFolder(fs.rootFolderId, "p");
    const contractId = await fs.addFile(project, "c.smart.c", FileTypes.SmartC, "long a;");
    const testId = await fs.addFile(project, "a.test.ts", FileTypes.Test, "");
    const testPath = fs.getFileMetadata(testId)!.path;

    recordTestVerdicts(fs, project, stateOf([[testPath, "passed"], [testPath, "failed"]]), [testPath]);

    expect(fs.status.of(project).tests[testId]).toEqual({
      sourceModified: fs.getFileMetadata(testId)!.lastModified,
      contractModified: fs.getFileMetadata(contractId)!.lastModified,
      passed: 1,
      failed: 1,
    });
  });

  it("treats empty entry paths as every test file in the project", async () => {
    const { fs } = createTestFs();
    const project = await fs.createFolder(fs.rootFolderId, "p");
    const a = await fs.addFile(project, "a.test.ts", FileTypes.Test, "");
    const b = await fs.addFile(project, "b.test.ts", FileTypes.Test, "");
    const aPath = fs.getFileMetadata(a)!.path;

    recordTestVerdicts(fs, project, stateOf([[aPath, "passed"]]), []);

    expect(fs.status.of(project).tests[a]).toMatchObject({ passed: 1, failed: 0, contractModified: 0 });
    expect(fs.status.of(project).tests[b]).toMatchObject({ passed: 0, failed: 0 });
  });
});
