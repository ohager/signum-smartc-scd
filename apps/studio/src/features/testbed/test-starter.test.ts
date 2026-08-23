import { describe, it, expect } from "bun:test";
import { testStarter } from "./test-starter";
import { acceptedFileType, FileTypes } from "@/features/project/filetype-icons";

describe("testStarter", () => {
  it("imports the named contract with a ?raw import", () => {
    expect(testStarter("counter.test.ts", "counter.smart.c")).toContain(
      'import ContractCode from "../counter.smart.c?raw"',
    );
  });

  it("names the suite after the contract", () => {
    expect(testStarter("counter.test.ts", "counter.smart.c")).toContain('describe("counter"');
  });

  it("still produces a runnable file when no contract sits beside it", () => {
    const src = testStarter("empty.test.ts", null);
    expect(src).toContain('import { describe, it, expect } from "vitest"');
    // No executable contract import, but the user is shown the form it takes.
    expect(src).not.toMatch(/^import ContractCode/m);
    expect(src).toContain("// import ContractCode from");
  });
});

describe("acceptedFileType", () => {
  it("accepts .test.ts and .ts as Test files", () => {
    expect(acceptedFileType("counter.test.ts")).toBe(FileTypes.Test);
    expect(acceptedFileType("context.ts")).toBe(FileTypes.Test);
  });

  it("still accepts the existing types", () => {
    expect(acceptedFileType("a.smart.c")).toBe(FileTypes.SmartC);
    expect(acceptedFileType("a.scenario.json")).toBe(FileTypes.Scenario);
    expect(acceptedFileType("a.asm")).toBe(FileTypes.ASM);
  });

  it("rejects unknown extensions", () => {
    expect(acceptedFileType("notes.md")).toBeNull();
  });
});
