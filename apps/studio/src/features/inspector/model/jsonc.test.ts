import { describe, expect, it } from "bun:test";
import { z } from "zod";
import { editDocument, offsetToPosition, parseDocument } from "./jsonc";

const Schema = z.strictObject({
  version: z.literal(1),
  items: z.array(z.strictObject({ id: z.string().regex(/^\d+$/), name: z.string().optional() })),
});

describe("parseDocument", () => {
  it("accepts comments and trailing commas", () => {
    const text = `{
  // the version
  "version": 1,
  "items": [{ "id": "1", },], /* done */
}`;
    const r = parseDocument(text, Schema);
    expect(r).toEqual({ ok: true, value: { version: 1, items: [{ id: "1" }] } });
  });

  it("reports a syntax error with its line and column", () => {
    const r = parseDocument(`{\n  "version": 1\n  "items": []\n}`, Schema);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.line).toBe(3);
    expect(r.errors[0]!.column).toBe(3);
  });

  it("positions a schema error at the offending node", () => {
    const text = `{
  "version": 1,
  "items": [
    { "id": "1" },
    { "id": "x1" }
  ]
}`;
    const r = parseDocument(text, Schema);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toEqual(["items", 1, "id"]);
    expect(r.errors[0]!.line).toBe(5);
    expect(r.errors[0]!.column).toBe(13);
  });

  it("positions a missing field at its parent object", () => {
    const r = parseDocument(`{\n  "items": []\n}`, Schema);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.errors[0]!.path).toEqual(["version"]);
    expect(r.errors[0]!.line).toBe(1);
  });
});

describe("editDocument", () => {
  const text = `{
  // keep me
  "version": 1,
  "items": [
    { "id": "1" } // first
  ]
}`;

  it("replaces one node and keeps every comment", () => {
    const out = editDocument(text, ["items", 0, "name"], "one");
    expect(out).toContain("// keep me");
    expect(out).toContain("// first");
    expect(parseDocument(out, Schema)).toEqual({
      ok: true,
      value: { version: 1, items: [{ id: "1", name: "one" }] },
    });
  });

  it("inserts into an array", () => {
    const out = editDocument(text, ["items", 1], { id: "2" }, { insert: true });
    expect(out).toContain("// keep me");
    const r = parseDocument(out, Schema);
    expect(r.ok && r.value.items.map((i) => i.id)).toEqual(["1", "2"]);
  });

  it("removes a node when the value is undefined", () => {
    const out = editDocument(text, ["items", 0], undefined);
    const r = parseDocument(out, Schema);
    expect(r.ok && r.value.items).toEqual([]);
    expect(out).toContain("// keep me");
  });
});

describe("offsetToPosition", () => {
  it("is 1-based", () => {
    expect(offsetToPosition("ab\ncd", 0)).toEqual({ line: 1, column: 1 });
    expect(offsetToPosition("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
  });
});
