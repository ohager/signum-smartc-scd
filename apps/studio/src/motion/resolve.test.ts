import { describe, it, expect } from "bun:test";
import { resolveMotion } from "./resolve";

describe("resolveMotion", () => {
  it("follows the system when nothing has been chosen", () => {
    expect(resolveMotion(null, true)).toBe("off");
    expect(resolveMotion(null, false)).toBe("on");
  });

  it("lets an explicit choice override the system — in both directions", () => {
    expect(resolveMotion("on", true)).toBe("on");
    expect(resolveMotion("off", false)).toBe("off");
  });
});
