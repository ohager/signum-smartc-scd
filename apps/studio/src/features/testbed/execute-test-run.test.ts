import { describe, it, expect } from "bun:test";
import typescript from "typescript";
import { detectWrapperOffset } from "./source-position";
import { executeTestRun } from "./execute-test-run";
import { createMainThreadTransport } from "./main-thread-transport";
import type { CompiledModule } from "./runner/types";
import type { RunState } from "./test-run-model";
import type { SnapshotSource } from "./project-snapshot";

const contractSource = await Bun.file(new URL("./__fixtures__/counter.smart.c", import.meta.url)).text();

/*
 * Monaco's transpiler needs a browser, so the test injects TypeScript's own
 * `transpileModule` with the same output shape (CommonJS plus a source map).
 * That keeps the line resolution honest: the failure line comes from a real map.
 */
const testTs = `import { describe, it, expect } from "vitest";
import { SimulatorTestbed } from "signum-smartc-testbed";
import code from "../counter.smart.c?raw";

describe("Counter", () => {
  it("passes", () => {
    expect(1n).toBe(1n);
  });
  it("fails on a wrong value", () => {
    const testbed = new SimulatorTestbed([{ blockheight: 1, amount: 2_0000_0000n, sender: 10n, recipient: 1n }])
      .loadContract(code)
      .runScenario();
    expect(testbed.getContractMemoryValue("counter")).toBe(99n);
  });
});
`;

const files: Record<string, string> = {
  "/proj/tests/counter.test.ts": testTs,
  "/proj/tests/other.test.ts": `import { it } from "vitest";\nit("other", () => {});`,
  "/proj/counter.smart.c": contractSource,
};

const source: SnapshotSource = {
  listFilesRecursive: () =>
    Object.keys(files).map((path) => ({ id: path, path })) as never,
  loadFile: async (id: string) => ({ content: files[id] }) as never,
};

const transpile = async (ts: Record<string, string>) =>
  Object.fromEntries(
    Object.entries(ts).map(([path, text]): [string, CompiledModule] => {
      const out = typescript.transpileModule(text, {
        fileName: path,
        compilerOptions: {
          module: typescript.ModuleKind.CommonJS,
          target: typescript.ScriptTarget.ES2022,
          esModuleInterop: true,
          sourceMap: true,
        },
      });
      return [path, { js: out.outputText, sourceMap: out.sourceMapText }];
    }),
  );

const deps = () => ({
  fs: source,
  transpile,
  transport: createMainThreadTransport(),
  resolveWrapperOffset: detectWrapperOffset,
});

describe("executeTestRun", () => {
  it("reports a failing expectation with expected/actual and line", async () => {
    const states: RunState[] = [];
    const result = await executeTestRun(deps(), "proj", { entryPath: "/proj/tests/counter.test.ts" }, (s) =>
      states.push(s),
    );

    expect(result.status).toBe("done");
    expect(result.counts.passed).toBe(1);
    expect(result.counts.failed).toBe(1);
    const failed = result.rows.find((r) => r.status === "failed")!;
    expect(failed.failure!.expected).toBe(99n);
    expect(failed.failure!.actual).toBe(1n);
    // `expect(...)` sits on line 13 of the source above.
    expect(failed.failure!.line).toBe(13);
    expect(states.at(-1)).toBe(result);
  });

  it("runs every test file when no entry is given", async () => {
    const result = await executeTestRun(deps(), "proj", {}, () => {});
    expect(new Set(result.rows.map((r) => r.file))).toEqual(
      new Set(["/proj/tests/counter.test.ts", "/proj/tests/other.test.ts"]),
    );
  });

  it("forwards every event to onEvent", async () => {
    const types: string[] = [];
    await executeTestRun(
      deps(),
      "proj",
      { entryPath: "/proj/tests/other.test.ts", onEvent: (e) => types.push(e.type) },
      () => {},
    );
    expect(types).toContain("test:end");
    expect(types.at(-1)).toBe("run:end");
  });

  it("surfaces a harness failure as a collect error and still ends the run", async () => {
    let terminated = false;
    const transport = createMainThreadTransport();
    const result = await executeTestRun(
      {
        ...deps(),
        transport: { ...transport, terminate: () => ((terminated = true), transport.terminate()) },
        transpile: async () => {
          throw new Error("syntax broke");
        },
      },
      "proj",
      {},
      () => {},
    );
    expect(result.status).toBe("done");
    expect(result.collectErrors).toEqual([{ file: "(project)", message: "syntax broke" }]);
    expect(terminated).toBe(true);
  });
});
