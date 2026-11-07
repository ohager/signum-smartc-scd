import { describe, it, expect, beforeEach } from "bun:test";
import { createBuildTools, type BuildDeps } from "./build-tools";
import { AssistantFailure } from "./errors";
import { createTestFs } from "./test-fs";
import { smartcStarter } from "@/features/project/smartc-starter";
import { FileTypes } from "@/features/project/filetype-icons";
import { gasReport } from "@/features/analysis/gas/gas-report";
import { lintContract } from "@/features/analysis/lint/lint";
import { fixture } from "@/features/analysis/lint/__fixtures__/load";
import { generateLabels } from "@/features/inspector/compiler/label-generator";
import { parseLabelMap } from "@/features/inspector/model/label-map";
import type { IndexedLabelMap } from "@/features/inspector/model/resolve-label-map";
import type { FileSystem } from "@/lib/file-system/file-system";

let fs: FileSystem;
let projectId: string;
let labelMaps: IndexedLabelMap[];
let lintParams: unknown[];
let tools: ReturnType<typeof createBuildTools>;

/* Synchronous wrappers over the real analyses: the worker only moves them off the main thread. */
const deps = (): BuildDeps => ({
  loadLabelMaps: async () => labelMaps,
  lint: async (source, params) => {
    lintParams.push(params);
    return lintContract(source, { params });
  },
  gas: async (source, loopCap) => gasReport(source, { loopCap }),
});

beforeEach(async () => {
  fs = createTestFs().fs;
  labelMaps = [];
  lintParams = [];
  tools = createBuildTools(fs, deps());
  projectId = await fs.createFolder(fs.rootFolderId, "p");
});

async function failure(promise: Promise<unknown>): Promise<AssistantFailure> {
  try {
    await promise;
  } catch (e) {
    expect(e).toBeInstanceOf(AssistantFailure);
    return e as AssistantFailure;
  }
  throw new Error("did not throw");
}

const add = (name: string, content: string) => fs.addFile(projectId, name, FileTypes.SmartC, content);

const BROKEN = "long a;\nvoid main(void) {\n  a = nope +;\n}\n";

const GAS_CONTRACT = (activation: string) => `
#program name Probe
${activation}
#pragma optimizationLevel 3
#pragma maxAuxVars 3

#define M_A 1
#define M_B 2

long counter;
struct TXINFO { long txId; long sender; long msg[4]; long amount; } cur;

void main() {
    while ((cur.txId = getNextTx()) != 0) {
        cur.sender = getSender(cur.txId);
        readMessage(cur.txId, 0, cur.msg);
        switch (cur.msg[0]) {
            case M_A: handleA(cur.msg[1]); break;
            case M_B: counter = 2; break;
        }
    }
}

void handleA(long n) {
    long i = 0;
    while (i < n) { counter += i; ++i; }
}
`;

describe("compile", () => {
  it("returns stats and records an ok verdict for the saved version", async () => {
    const id = await add("c.smart.c", smartcStarter("c"));
    const { result } = await tools.compile({ path: "/p/c.smart.c" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.stats.codePages).toBeGreaterThan(0);
    expect(typeof result.stats.minimumFeePlanck).toBe("string");
    expect(typeof result.stats.activationAmountPlanck).toBe("string");
    expect(Array.isArray(result.warnings)).toBe(true);
    expect(result.warnings.every((w) => w.length > 0 && w === w.trim())).toBe(true);
    const verdict = fs.status.of(projectId).compile;
    expect(verdict?.errorCount).toBe(0);
    expect(verdict?.sourceModified).toBe(fs.getFileMetadata(id)!.lastModified);
  });

  it("returns errors with line and col and records errorCount 1", async () => {
    const id = await add("c.smart.c", BROKEN);
    const { result } = await tools.compile({ path: "/p/c.smart.c" });
    if (result.ok) throw new Error("expected errors");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]!.line).toBe(3);
    expect(result.errors[0]!.col).toBeGreaterThan(0);
    expect(result.errors[0]!.message.length).toBeGreaterThan(0);
    expect(fs.status.of(projectId).compile).toEqual({
      sourceModified: fs.getFileMetadata(id)!.lastModified,
      errorCount: 1,
    });
  });

  it("includes assembly only when asked", async () => {
    await add("c.smart.c", smartcStarter("c"));
    const plain = (await tools.compile({ path: "/p/c.smart.c" })).result;
    expect("assembly" in plain).toBe(false);
    const asked = (await tools.compile({ path: "/p/c.smart.c", assembly: true })).result;
    if (!asked.ok) throw new Error("expected ok");
    expect(asked.assembly).toContain("^declare");
    expect(asked.assemblyTruncated).toBe(false);
  });

  it("splits compiler warnings into trimmed non-empty lines", async () => {
    await add("w.smart.c", "long unused;\nlong a;\nvoid main(void) { a = 1; }\n");
    const { result } = await tools.compile({ path: "/p/w.smart.c" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.warnings.length).toBeGreaterThan(0);
    for (const w of result.warnings) expect(w).not.toContain("\n");
  });

  it("refuses non .smart.c paths with path_not_allowed and records nothing", async () => {
    await fs.addFile(projectId, "a.ts", "test", "x");
    expect((await failure(tools.compile({ path: "/p/a.ts" }))).code).toBe("path_not_allowed");
    expect(fs.status.of(projectId).compile).toBeUndefined();
  });

  it("fails with file_not_found for a missing contract", async () => {
    expect((await failure(tools.compile({ path: "/p/none.smart.c" }))).code).toBe("file_not_found");
  });
});

describe("analyze_gas", () => {
  it("reports activationTooLow with compact rows and decimal Signa", async () => {
    await add("g.smart.c", GAS_CONTRACT("#program activationAmount 1000000"));
    const { result } = await tools.analyze_gas({ path: "/p/g.smart.c" });
    if (!result.ok) throw new Error("expected ok");
    expect(result.activationTooLow).toBe(true);
    expect(result.worstCaseComplete).toBe(true);
    expect(result.activationAmountSigna).toBe("0.01");
    expect(result.worstCaseSigna).toMatch(/^\d+(\.\d{1,8})?$/);
    expect(result.worstCaseSigna.endsWith("0") && result.worstCaseSigna.includes(".")).toBe(false);
    const row = result.methods.find((m) => m.handler === "handleA")!;
    expect(row.code).toBe(1);
    expect(result.handlers.find((h) => h.name === "handleA")?.capHit).toBe(true);
    expect(row.flags).toEqual([]);
    expect(typeof row.maxSigna).toBe("number");
    expect(result.loopCap).toBeGreaterThan(0);
    expect(result.recursionDetected).toBe(false);
    expect(JSON.stringify(result)).not.toContain("totalInstructions");
  });

  it("accepts a sufficient activation and passes loopCap through", async () => {
    await add("g.smart.c", GAS_CONTRACT("#program activationAmount 1_0000_0000"));
    const { result } = await tools.analyze_gas({ path: "/p/g.smart.c", loopCap: 3 });
    if (!result.ok) throw new Error("expected ok");
    expect(result.activationTooLow).toBe(false);
    expect(result.activationAmountSigna).toBe("1");
    expect(result.loopCap).toBe(3);
  });

  it("reports a compile failure as a result, not a tool error", async () => {
    await add("g.smart.c", BROKEN);
    const { result } = await tools.analyze_gas({ path: "/p/g.smart.c" });
    if (result.ok) throw new Error("expected errors");
    expect(result.errors[0]).toMatchObject({ line: 3 });
  });

  it("refuses other paths", async () => {
    expect((await failure(tools.analyze_gas({ path: "/p/x.md" }))).code).toBe("path_not_allowed");
  });
});

describe("gas report shape", () => {
  it("survives structuredClone unchanged, as the worker boundary requires", () => {
    const report = gasReport(GAS_CONTRACT("#program activationAmount 1000000"));
    expect(report.ok).toBe(true);
    expect(structuredClone(report)).toEqual(report);
  });
});

describe("lint", () => {
  it("returns compiled and findings", async () => {
    await add("l.smart.c", fixture("pragma-fires"));
    const { result } = await tools.lint({ path: "/p/l.smart.c" });
    expect(result.compiled).toBe(true);
    expect(result.findings.some((f) => f.rule === "pragma-version")).toBe(true);
  });

  it("reports compiled false for broken code", async () => {
    await add("l.smart.c", fixture("not-compiling"));
    expect((await tools.lint({ path: "/p/l.smart.c" })).result.compiled).toBe(false);
  });

  it("passes Label Map params through", async () => {
    // No TESTBED convention here: only the Label Map can mark `owner` as a parameter.
    const source = fixture("overwritten-param-fires").replace(/#ifdef TESTBED[\s\S]*?#endif\n/, "");
    await add("l.smart.c", source);
    const without = (await tools.lint({ path: "/p/l.smart.c" })).result;
    expect(without.findings.some((f) => f.rule === "overwritten-param")).toBe(false);

    const generated = generateLabels(source);
    if (!generated.ok) throw new Error("labels");
    const owner = generated.labels.slots.find((s) => s.name === "owner")!;
    const text = JSON.stringify({
      version: 1,
      name: "M",
      codeHashes: [{ hash: generated.labels.codeHash }],
      slots: [{ index: owner.index, name: "owner", format: "long", param: true, origin: "manual" }],
    });
    const parsed = parseLabelMap(text);
    if (!parsed.ok) throw new Error("map");
    labelMaps = [{ fileId: "m", path: "/p/m.labels.json", name: "m.labels.json", map: parsed.value, errors: [] }];

    const withMap = (await tools.lint({ path: "/p/l.smart.c" })).result;
    expect(withMap.findings.some((f) => f.rule === "overwritten-param")).toBe(true);
  });

  it("still lints when the Label Maps cannot be loaded, and says so", async () => {
    await add("l.smart.c", fixture("pragma-fires"));
    const broken = createBuildTools(fs, {
      ...deps(),
      loadLabelMaps: async () => {
        throw new Error("storage down");
      },
    });
    const { result } = await broken.lint({ path: "/p/l.smart.c" });
    expect(result.labelMapsUnavailable).toBe(true);
    expect(result.findings.some((f) => f.rule === "pragma-version")).toBe(true);
    expect((await tools.lint({ path: "/p/l.smart.c" })).result.labelMapsUnavailable).toBeUndefined();
  });

  it("refuses other paths", async () => {
    expect((await failure(tools.lint({ path: "/p/x.ts" }))).code).toBe("path_not_allowed");
  });
});
