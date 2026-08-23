import { describe, it, expect as bunExpect } from "bun:test";
import { expect } from "./expect";

describe("expect", () => {
  it("compares bigints with toBe", () => {
    expect(5n).toBe(5n);
  });

  it("deep-compares structures containing bigints", () => {
    expect([{ amount: 100n }]).toEqual([{ amount: 100n }]);
  });

  it("exposes expected and actual on failure for diffing", () => {
    let error: any;
    try {
      expect(1n).toBe(2n);
    } catch (e) {
      error = e;
    }
    bunExpect(error).toBeDefined();
    bunExpect(error.expected).toBe(2n);
    bunExpect(error.actual).toBe(1n);
    bunExpect(error.message).toContain("expected 1n to be 2n");
  });

  it("supports negation", () => {
    expect(1n).not.toBe(2n);
  });
});
