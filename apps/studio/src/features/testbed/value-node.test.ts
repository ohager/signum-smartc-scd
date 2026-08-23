import { describe, it, expect } from "bun:test";
import { describeValue, summarize } from "./value-node";

describe("describeValue", () => {
  it("describes a primitive as a leaf", () => {
    expect(describeValue(5n)).toEqual({ kind: "leaf", text: "5n" });
    expect(describeValue("hi")).toEqual({ kind: "leaf", text: '"hi"' });
    expect(describeValue(null)).toEqual({ kind: "leaf", text: "null" });
    expect(describeValue(undefined)).toEqual({ kind: "leaf", text: "undefined" });
  });

  it("describes an object as keyed children", () => {
    expect(describeValue({ id: 10n })).toEqual({
      kind: "object",
      entries: [{ key: "id", value: { kind: "leaf", text: "10n" } }],
    });
  });

  it("keeps the constructor name of a class instance", () => {
    class Recorded {
      node = 1n;
    }
    const node = describeValue(new Recorded());
    expect(node.kind).toBe("object");
    expect(node.kind === "object" && node.ctor).toBe("Recorded");
  });

  it("leaves a plain object without a constructor name", () => {
    const node = describeValue({ a: 1n });
    expect(node.kind === "object" && node.ctor).toBeUndefined();
  });

  it("describes an array as ordered children", () => {
    expect(describeValue([1n, 2n])).toEqual({
      kind: "array",
      items: [
        { kind: "leaf", text: "1n" },
        { kind: "leaf", text: "2n" },
      ],
    });
  });

  it("nests to a useful depth, unlike the inline text", () => {
    const node = describeValue({ a: { b: { c: { d: { e: 1n } } } } });
    let current = node;
    for (const key of ["a", "b", "c", "d"]) {
      expect(current.kind).toBe("object");
      current = (current as Extract<typeof current, { kind: "object" }>).entries.find(
        (entry) => entry.key === key,
      )!.value;
    }
    expect(current).toEqual({
      kind: "object",
      entries: [{ key: "e", value: { kind: "leaf", text: "1n" } }],
    });
  });

  it("stops at the depth cap", () => {
    const node = describeValue({ a: { b: 1n } }, { maxDepth: 1 });
    expect(node.kind === "object" && node.entries[0].value).toEqual({
      kind: "leaf",
      text: "[Object]",
    });
  });

  it("marks a cycle", () => {
    const a: Record<string, unknown> = {};
    a.self = a;
    expect(describeValue(a)).toEqual({
      kind: "object",
      entries: [{ key: "self", value: { kind: "leaf", text: "[Circular]" } }],
    });
  });

  it("does not treat a repeated sibling as a cycle", () => {
    const shared = { n: 1n };
    const node = describeValue({ a: shared, b: shared });
    expect(node.kind === "object" && node.entries[1].value.kind).toBe("object");
  });

  it("survives a throwing getter and keeps the other keys", () => {
    const node = describeValue({
      good: 1n,
      get bad(): never {
        throw new Error("nope");
      },
    });
    expect(node.kind === "object" && node.entries).toEqual([
      { key: "good", value: { kind: "leaf", text: "1n" } },
      { key: "bad", value: { kind: "leaf", text: "<throws>" } },
    ]);
  });

  it("renders Map, Set and Error as leaves rather than walking them", () => {
    expect(describeValue(new Map([[1, 2]]))).toEqual({ kind: "leaf", text: "Map(1)" });
    expect(describeValue(new Set([1]))).toEqual({ kind: "leaf", text: "Set(1)" });
    expect(describeValue(new TypeError("bad"))).toEqual({ kind: "leaf", text: "TypeError: bad" });
  });

  it("stops once the node budget is spent", () => {
    const wide = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]));
    const node = describeValue(wide, { maxNodes: 10 });
    const rendered = node.kind === "object" ? node.entries.map((e) => e.value) : [];
    expect(rendered.some((value) => value.kind === "leaf" && value.text === "…")).toBe(true);
  });

  it("produces something structured-cloneable, since it crosses the worker boundary", () => {
    const node = describeValue({ id: 10n, nested: { list: [1n] } });
    expect(structuredClone(node)).toEqual(node);
  });
});

describe("summarize", () => {
  it("summarises an object by key count", () => {
    expect(summarize(describeValue({ a: 1n, b: 2n }))).toBe("{ … 2 keys }");
  });

  it("uses the singular for one key", () => {
    expect(summarize(describeValue({ a: 1n }))).toBe("{ … 1 key }");
  });

  it("includes the constructor name", () => {
    class Recorded {
      node = 1n;
    }
    expect(summarize(describeValue(new Recorded()))).toBe("Recorded { … 1 key }");
  });

  it("summarises an array by length", () => {
    expect(summarize(describeValue([1n, 2n]))).toBe("[ … 2 items ]");
    expect(summarize(describeValue([1n]))).toBe("[ … 1 item ]");
  });

  it("shows an empty object or array in full", () => {
    expect(summarize(describeValue({}))).toBe("{}");
    expect(summarize(describeValue([]))).toBe("[]");
  });

  it("returns a leaf's own text", () => {
    expect(summarize(describeValue(5n))).toBe("5n");
  });
});
