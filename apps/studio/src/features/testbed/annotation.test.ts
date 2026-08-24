import { describe, it, expect } from "bun:test";
import { formatAnnotation } from "./annotation";

describe("formatAnnotation", () => {
  it("shows a binding as name = value", () => {
    expect(formatAnnotation({ values: ["2n"], count: 1, name: "counter" })).toEqual({
      kind: "value",
      text: "counter = 2n",
    });
  });

  it("shows the last value and a count when a line repeated", () => {
    const result = formatAnnotation({ values: ["1n", "2n", "3n"], count: 3, name: "r" });
    expect(result!.text).toBe("r = 3n  ×3");
  });

  it("counts every run, not just the values still held", () => {
    const result = formatAnnotation({ values: ["299n", "300n"], count: 300, name: "r" });
    expect(result!.text).toBe("r = 300n  ×300");
  });

  it("shows a value with no name on its own", () => {
    expect(formatAnnotation({ values: ["2n"], count: 1 })!.text).toBe("2n");
  });

  it("shows a tick for a completed assertion", () => {
    expect(formatAnnotation({ values: [], count: 0, ok: true })).toEqual({ kind: "ok", text: "✓" });
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

describe("formatAnnotation length", () => {
  const long = "Recorded { node: SimNode { scenario: [Object], blockchain: [Object] }, extra: 1n }";

  it("keeps a long value off the end of the line", () => {
    const result = formatAnnotation({ values: [long], count: 1, name: "testbed" })!;
    expect(result.text.length).toBeLessThanOrEqual(60);
    expect(result.text.endsWith("…")).toBe(true);
  });

  it("leaves a short value alone", () => {
    expect(formatAnnotation({ values: ["2n"], count: 1, name: "counter" })).toEqual({
      kind: "value",
      text: "counter = 2n",
    });
  });

  it("keeps the repeat badge visible even when the value is shortened", () => {
    const result = formatAnnotation({ values: [long, long], count: 2, name: "testbed" })!;
    expect(result.text.endsWith("×2")).toBe(true);
  });
});

describe("formatAnnotation kinds", () => {
  it("marks a captured value as inspectable", () => {
    expect(formatAnnotation({ values: ["2n"], count: 1, name: "a" })!.kind).toBe("value");
  });

  it("marks a bare assertion tick as having nothing behind it", () => {
    expect(formatAnnotation({ values: [], count: 0, ok: true })!.kind).toBe("ok");
  });

  it("treats a line with both as a value, since that is what a click can show", () => {
    expect(formatAnnotation({ values: ["1n"], count: 1, name: "a", ok: true })!.kind).toBe("value");
  });
});
