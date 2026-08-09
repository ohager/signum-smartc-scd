import { describe, it, expect } from "bun:test";
import { isInternalVar } from "./vars";

describe("isInternalVar", () => {
  it("flags compiler registers and ZERO", () => {
    expect(isInternalVar("r0")).toBe(true);
    expect(isInternalVar("r12")).toBe(true);
    expect(isInternalVar("ZERO")).toBe(true);
  });
  it("keeps user variables", () => {
    expect(isInternalVar("n")).toBe(false);
    expect(isInternalVar("currentTx_sender")).toBe(false);
    expect(isInternalVar("_counterTimestamp")).toBe(false); // real, user-usable
  });
});
