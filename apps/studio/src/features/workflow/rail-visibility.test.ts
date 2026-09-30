import { describe, expect, it } from "bun:test";
import { showsRail } from "./rail-visibility";

describe("showsRail", () => {
  it("hides only for contract-less folders that hold inspection files", () => {
    expect(showsRail([{ name: "a.inspect.json" }], false)).toBe(false);
    expect(showsRail([{ name: "a.labels.json" }], false)).toBe(false);
    expect(showsRail([], false)).toBe(true);
    expect(showsRail([{ name: "a.inspect.json" }], true)).toBe(true);
  });
});
