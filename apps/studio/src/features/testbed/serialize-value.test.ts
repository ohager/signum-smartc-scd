import { describe, it, expect } from "bun:test";
import { serializeValue } from "./serialize-value";

describe("serializeValue", () => {
  it("renders bigints with the n suffix", () => {
    expect(serializeValue(5n)).toBe("5n");
  });

  it("quotes strings by default", () => {
    expect(serializeValue("hi")).toBe('"hi"');
  });

  it("leaves top-level strings bare when asked, for console output", () => {
    expect(serializeValue("hi", { quoteStrings: false })).toBe("hi");
  });

  it("still quotes strings nested inside a structure", () => {
    expect(serializeValue({ a: "hi" }, { quoteStrings: false })).toBe('{ a: "hi" }');
  });

  it("names the constructor of a class instance", () => {
    class SimulatorTestbed {}
    expect(serializeValue(new SimulatorTestbed())).toBe("SimulatorTestbed {}");
  });

  it("renders plain objects without a prefix", () => {
    expect(serializeValue({ a: 1n })).toBe("{ a: 1n }");
  });

  it("renders arrays", () => {
    expect(serializeValue([1n, 2n])).toBe("[1n, 2n]");
  });

  it("marks a cycle instead of recursing forever", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(serializeValue(a)).toBe("{ self: [Circular] }");
  });

  it("does not treat a repeated sibling reference as a cycle", () => {
    const shared = { n: 1n };
    expect(serializeValue({ a: shared, b: shared })).toBe("{ a: { n: 1n }, b: { n: 1n } }");
  });

  it("stops at the depth cap", () => {
    expect(serializeValue({ a: { b: { c: { d: 1 } } } })).toBe("{ a: { b: { c: [Object] } } }");
  });

  it("truncates past the length cap", () => {
    const out = serializeValue({ s: "x".repeat(500) }, { maxLength: 20 });
    expect(out).toHaveLength(20);
    expect(out.endsWith("…")).toBe(true);
  });

  it("survives a throwing getter, and keeps the other keys", () => {
    const obj = {
      good: 1n,
      get bad(): never {
        throw new Error("nope");
      },
    };
    expect(serializeValue(obj)).toBe("{ good: 1n, bad: <throws> }");
  });

  it("renders undefined and null", () => {
    expect(serializeValue(undefined)).toBe("undefined");
    expect(serializeValue(null)).toBe("null");
  });

  it("renders Map and Set by size, not contents", () => {
    expect(serializeValue(new Map([[1, 2]]))).toBe("Map(1)");
    expect(serializeValue(new Set([1, 2]))).toBe("Set(2)");
  });

  it("renders an Error by name and message", () => {
    expect(serializeValue(new TypeError("bad"))).toBe("TypeError: bad");
  });

  it("renders a function by name", () => {
    expect(serializeValue(function send() {})).toBe("[Function: send]");
  });
});

describe("serializeValue pretty", () => {
  it("puts each object key on its own line", () => {
    expect(serializeValue({ id: 10n, balance: 5n }, { pretty: true })).toBe(
      "{\n  id: 10n,\n  balance: 5n\n}",
    );
  });

  it("indents nested structures", () => {
    expect(serializeValue({ a: { b: 1n } }, { pretty: true })).toBe(
      "{\n  a: {\n    b: 1n\n  }\n}",
    );
  });

  it("puts each array element on its own line", () => {
    expect(serializeValue([1n, 2n], { pretty: true })).toBe("[\n  1n,\n  2n\n]");
  });

  it("keeps an empty object on one line", () => {
    expect(serializeValue({}, { pretty: true })).toBe("{}");
    expect(serializeValue([], { pretty: true })).toBe("[]");
  });

  it("keeps the class name prefix", () => {
    class Recorded {
      node = 1n;
    }
    expect(serializeValue(new Recorded(), { pretty: true })).toBe("Recorded {\n  node: 1n\n}");
  });

  it("goes deeper when asked, for the detail view", () => {
    const deep = { a: { b: { c: { d: { e: 1n } } } } };
    expect(serializeValue(deep, { maxDepth: 6 })).toContain("e: 1n");
    // The inline default stops far shallower.
    expect(serializeValue(deep)).toContain("[Object]");
  });

  it("still marks cycles when pretty", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(serializeValue(a, { pretty: true })).toBe("{\n  self: [Circular]\n}");
  });

  it("still truncates past its length cap when pretty", () => {
    const out = serializeValue({ s: "x".repeat(500) }, { pretty: true, maxLength: 20 });
    expect(out).toHaveLength(20);
    expect(out.endsWith("…")).toBe(true);
  });
});
