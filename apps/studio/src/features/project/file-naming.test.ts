import { describe, it, expect } from "bun:test";
import { withExtension, uniqueName } from "./file-naming";

describe("withExtension", () => {
  it("adds the extension when missing", () => {
    expect(withExtension("foo", ".smart.c")).toBe("foo.smart.c");
  });
  it("is idempotent when already present", () => {
    expect(withExtension("foo.smart.c", ".smart.c")).toBe("foo.smart.c");
  });
});

describe("uniqueName", () => {
  it("returns the name unchanged when there is no collision", () => {
    expect(uniqueName("foo", [], "")).toBe("foo");
  });
  it("appends -2 on collision (no extension)", () => {
    expect(uniqueName("foo", ["foo"], "")).toBe("foo-2");
  });
  it("inserts -N before the extension", () => {
    expect(uniqueName("a.smart.c", ["a.smart.c"], ".smart.c")).toBe("a-2.smart.c");
    expect(uniqueName("a.smart.c", ["a.smart.c", "a-2.smart.c"], ".smart.c")).toBe("a-3.smart.c");
  });
});
