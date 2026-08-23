import { describe, it, expect } from "bun:test";
import { detectWrapperOffset, firstFrameIn } from "./source-position";

describe("firstFrameIn", () => {
  it("parses a Bun/JSC frame", () => {
    const stack = [
      "Error: kaboom",
      "    at <anonymous> (/proj/tests/a.test.ts:4:45)",
      "    at <anonymous> (/elsewhere/runner.ts:22:15)",
    ].join("\n");
    expect(firstFrameIn(stack, "/proj/tests/a.test.ts")).toEqual({
      file: "/proj/tests/a.test.ts",
      line: 4,
      column: 45,
    });
  });

  it("parses a V8 frame with a function name", () => {
    const stack = ["Error: x", "    at Object.run (/proj/tests/a.test.ts:12:9)"].join("\n");
    expect(firstFrameIn(stack, "/proj/tests/a.test.ts")?.line).toBe(12);
  });

  it("parses a V8 frame with no function name", () => {
    const stack = ["Error: x", "    at /proj/tests/a.test.ts:7:3"].join("\n");
    expect(firstFrameIn(stack, "/proj/tests/a.test.ts")?.line).toBe(7);
  });

  it("skips frames from other files", () => {
    const stack = [
      "Error: x",
      "    at <anonymous> (/other/helper.ts:1:1)",
      "    at <anonymous> (/proj/tests/a.test.ts:9:2)",
    ].join("\n");
    expect(firstFrameIn(stack, "/proj/tests/a.test.ts")?.line).toBe(9);
  });

  it("returns null when the file never appears", () => {
    expect(firstFrameIn("Error: x\n    at /other/a.ts:1:1", "/proj/a.test.ts")).toBeNull();
  });

  it("returns null for an empty or malformed stack", () => {
    expect(firstFrameIn("", "/proj/a.test.ts")).toBeNull();
    expect(firstFrameIn("no frames here", "/proj/a.test.ts")).toBeNull();
  });
});

describe("detectWrapperOffset", () => {
  it("measures how many lines new Function prepends", () => {
    expect(detectWrapperOffset()).toBeGreaterThanOrEqual(0);
  });

  it("produces an offset that actually corrects a real frame", () => {
    const offset = detectWrapperOffset();
    const body = [
      "'use strict';",
      "// filler",
      "throw new Error('here');",
      "//# sourceURL=/probe.js",
    ].join("\n");

    try {
      new Function(body)();
      throw new Error("should have thrown");
    } catch (error) {
      const frame = firstFrameIn(String((error as Error).stack), "/probe.js");
      // The throw is on body line 3; the corrected frame must say so.
      expect(frame!.line - offset).toBe(3);
    }
  });
});
