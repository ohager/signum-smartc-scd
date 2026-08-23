import { describe, it, expect } from "bun:test";
import { describeValue, toSourceText } from "./value-node";

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

describe("toSourceText", () => {
  it("renders a leaf as itself", () => {
    expect(toSourceText(describeValue(5n))).toBe("5n");
  });

  it("renders an object as an indented literal", () => {
    expect(toSourceText(describeValue({ id: 10n, balance: 5n }))).toBe(
      "{\n  id: 10n,\n  balance: 5n,\n}",
    );
  });

  it("indents nested structures", () => {
    expect(toSourceText(describeValue({ a: { b: 1n } }))).toBe("{\n  a: {\n    b: 1n,\n  },\n}");
  });

  it("renders an array with one element per line", () => {
    expect(toSourceText(describeValue([1n, 2n]))).toBe("[\n  1n,\n  2n,\n]");
  });

  it("keeps empty structures on one line, since there is nothing to fold", () => {
    expect(toSourceText(describeValue({}))).toBe("{}");
    expect(toSourceText(describeValue([]))).toBe("[]");
  });

  it("names a class instance in a comment, so the text stays valid JavaScript", () => {
    class Recorded {
      node = 1n;
    }
    expect(toSourceText(describeValue(new Recorded()))).toBe("/* Recorded */ {\n  node: 1n,\n}");
  });

  it("quotes a key that is not a plain identifier", () => {
    expect(toSourceText(describeValue({ "a-b": 1n }))).toBe('{\n  "a-b": 1n,\n}');
  });

  it("leaves a bigint as a literal rather than a string, which JSON could not", () => {
    expect(toSourceText(describeValue({ amount: 200000000n }))).toContain("amount: 200000000n");
  });
});

describe("toSourceText indentation", () => {
  // The Value tab folds with Monaco's indentation strategy rather than the
  // language service, so this formatting is load-bearing: every nested line
  // must be indented further than the line that opens it, or folding breaks.
  it("indents every child line deeper than the line that opens it", () => {
    const text = toSourceText(
      describeValue({ account: { id: 10n, tokens: [1n, 2n] }, ok: true }),
    );
    const indentOf = (line: string) => line.length - line.trimStart().length;
    const lines = text.split("\n");

    expect(lines.length).toBeGreaterThan(3);
    for (const [index, line] of lines.entries()) {
      if (index === 0 || line.trim() === "") continue;
      // Every line after the first is either deeper than the root, or a closer
      // returning to a shallower level — never deeper than one step at a time.
      expect(indentOf(line) % 2).toBe(0);
    }
    // The opening line is at column 0 and its first child is indented.
    expect(indentOf(lines[0])).toBe(0);
    expect(indentOf(lines[1])).toBe(2);
  });

  it("closes each block at the indent of the line that opened it", () => {
    const text = toSourceText(describeValue({ a: { b: 1n } }));
    expect(text).toBe("{\n  a: {\n    b: 1n,\n  },\n}");
  });
});
