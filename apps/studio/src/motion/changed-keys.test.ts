import { describe, it, expect } from "bun:test";
import { changedKeys } from "./changed-keys";

describe("changedKeys", () => {
  it("reports nothing the first time values are seen", () => {
    // A panel opening is not an event. Flashing every row on first sight is
    // the single most common way this kind of animation becomes noise.
    expect(changedKeys(undefined, { count: "0", block: "1" })).toEqual(new Set());
  });

  it("reports only the keys whose value actually changed", () => {
    const before = { count: "0", block: "1" };
    const after = { count: "3", block: "1" };
    expect(changedKeys(before, after)).toEqual(new Set(["count"]));
  });

  it("treats a key that has just appeared as unchanged", () => {
    expect(changedKeys({ count: "0" }, { count: "0", fresh: "9" })).toEqual(new Set());
  });

  it("ignores keys that went away", () => {
    expect(changedKeys({ count: "0", gone: "1" }, { count: "0" })).toEqual(new Set());
  });
});
