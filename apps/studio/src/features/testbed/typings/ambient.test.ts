import { describe, it, expect } from "bun:test";
import { AMBIENT_TYPINGS, TYPED_TESTBED_VERSION } from "./ambient";
import pkg from "../../../../package.json";

describe("ambient typings", () => {
  it("declares the three modules a test file imports", () => {
    const all = AMBIENT_TYPINGS.map((t) => t.content).join("\n");
    expect(all).toContain('declare module "vitest"');
    expect(all).toContain('declare module "signum-smartc-testbed"');
    expect(all).toContain('declare module "*?raw"');
  });

  it("gives every lib a distinct file path, as addExtraLib requires", () => {
    const paths = AMBIENT_TYPINGS.map((t) => t.filePath);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it("covers the testbed methods the starter template uses", () => {
    const all = AMBIENT_TYPINGS.map((t) => t.content).join("\n");
    for (const method of [
      "loadContract",
      "runScenario",
      "getContractMemoryValue",
      "getContractMapValue",
      "sendTransactionAndGetResponse",
    ]) {
      expect(all).toContain(method);
    }
  });

  it("is pinned to the installed testbed version so drift is caught", () => {
    const installed = pkg.dependencies["signum-smartc-testbed"].replace(/^[\^~]/, "");
    expect(TYPED_TESTBED_VERSION).toBe(installed);
  });
});
