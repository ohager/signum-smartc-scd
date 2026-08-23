import { describe, it, expect } from "bun:test";
import { runRequest } from "./run-request";
import type { TestEvent } from "./types";

const contractSource = await Bun.file(
  new URL("../__fixtures__/counter.smart.c", import.meta.url),
).text();

// Hand-written CommonJS, matching what TypeScript emits for:
//   import { describe, it, expect, beforeEach } from "vitest";
//   import { SimulatorTestbed } from "signum-smartc-testbed";
//   import ContractCode from "../counter.smart.c?raw";
//   import { Scenario } from "./scenarios";
const testFile = `
const vitest_1 = require("vitest");
const testbed_1 = require("signum-smartc-testbed");
var __importDefault = (this && this.__importDefault) || function (mod) {
  return (mod && mod.__esModule) ? mod : { "default": mod };
};
const code_1 = __importDefault(require("../counter.smart.c?raw"));
const scenarios_1 = require("./scenarios");

vitest_1.describe("Counter", () => {
  let testbed;
  vitest_1.beforeEach(() => {
    testbed = new testbed_1.SimulatorTestbed(scenarios_1.Scenario)
      .loadContract(code_1.default)
      .runScenario();
  });
  vitest_1.it("counts every incoming transaction", () => {
    vitest_1.expect(testbed.getContractMemoryValue("counter")).toBe(2n);
  });
  vitest_1.it("remembers the last sender", () => {
    vitest_1.expect(testbed.getContractMemoryValue("lastSender")).toBe(20n);
  });
  vitest_1.it("writes per-sender counts to the map", () => {
    vitest_1.expect(testbed.getContractMapValue(1n, 10n)).toBe(1n);
    vitest_1.expect(testbed.getContractMapValue(1n, 20n)).toBe(2n);
  });
  vitest_1.it("reports a wrong expectation as a failure", () => {
    vitest_1.expect(testbed.getContractMemoryValue("counter")).toBe(99n);
  });
});
`;

const scenariosFile = `
exports.Scenario = [
  { blockheight: 1, amount: 2_0000_0000n, sender: 10n, recipient: 1n },
  { blockheight: 2, amount: 2_0000_0000n, sender: 20n, recipient: 1n },
];
`;

async function runIntegration() {
  const events: TestEvent[] = [];
  await runRequest(
    {
      modules: {
        "/proj/tests/counter.test.ts": { js: testFile },
        "/proj/tests/scenarios.ts": { js: scenariosFile },
      },
      rawFiles: { "/proj/counter.smart.c": contractSource },
      entryPaths: ["/proj/tests/counter.test.ts"],
    },
    (e) => events.push(e),
  );
  return events;
}

describe("integration: real contract through the real testbed", () => {
  it("compiles the contract, runs the scenario and reports each result", async () => {
    const ends = (await runIntegration()).filter((e) => e.type === "test:end") as any[];
    expect(ends.map((e) => e.status)).toEqual(["passed", "passed", "passed", "failed"]);
  });

  it("reports the deliberate failure with a bigint diff", async () => {
    const ends = (await runIntegration()).filter((e) => e.type === "test:end") as any[];
    const failure = ends[3].failure;
    expect(failure.expected).toBe(99n);
    expect(failure.actual).toBe(2n);
    expect(failure.message).toContain("expected 2n to be 99n");
  });

  it("records a duration for each executed test", async () => {
    const ends = (await runIntegration()).filter((e) => e.type === "test:end") as any[];
    for (const end of ends) expect(typeof end.durationMs).toBe("number");
  });
});
