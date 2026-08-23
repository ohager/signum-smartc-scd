import { describe, it, expect } from "bun:test";
import { formatAnnotation } from "./annotation";

describe("formatAnnotation", () => {
  it("shows a binding as name = value", () => {
    expect(formatAnnotation({ values: ["2n"], count: 1, name: "counter" })).toEqual({
      text: "counter = 2n",
    });
  });

  it("shows the last value and a count when a line repeated", () => {
    const result = formatAnnotation({ values: ["1n", "2n", "3n"], count: 3, name: "r" });
    expect(result!.text).toBe("r = 3n  ×3");
  });

  it("lists every value in the hover when a line repeated", () => {
    const result = formatAnnotation({ values: ["1n", "2n", "3n"], count: 3, name: "r" });
    expect(result!.hover).toBe("1: 1n\n\n2: 2n\n\n3: 3n");
  });

  it("has no hover when a line ran once", () => {
    expect(formatAnnotation({ values: ["2n"], count: 1, name: "c" })!.hover).toBeUndefined();
  });

  it("says so when the values shown are only the tail", () => {
    const result = formatAnnotation({ values: ["299n", "300n"], count: 300, name: "r" });
    expect(result!.text).toBe("r = 300n  ×300");
    expect(result!.hover).toContain("showing last 2 of 300");
  });

  it("numbers a truncated hover from the real iteration, not from one", () => {
    const result = formatAnnotation({ values: ["299n", "300n"], count: 300, name: "r" });
    expect(result!.hover).toContain("299: 299n");
    expect(result!.hover).toContain("300: 300n");
  });

  it("shows a tick for a completed assertion", () => {
    expect(formatAnnotation({ values: [], count: 0, ok: true })).toEqual({ text: "✓" });
  });

  it("prefers the binding over the assertion marker when a line has both", () => {
    expect(formatAnnotation({ values: ["1n"], count: 1, name: "a", ok: true })!.text).toBe("a = 1n");
  });

  it("returns null for a line with nothing to say", () => {
    expect(formatAnnotation({ values: [], count: 0 })).toBeNull();
  });

  it("returns null when the value was dropped by the budget", () => {
    // count is honest, but there is no value to show.
    expect(formatAnnotation({ values: [], count: 4, name: "r" })).toBeNull();
  });
});
