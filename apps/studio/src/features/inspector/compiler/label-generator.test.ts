import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { generateLabels, slotsFromNames } from "./label-generator";

const typed = readFileSync(join(import.meta.dir, "__fixtures__/typed.smart.c"), "utf8");
const counter = readFileSync(join(import.meta.dir, "../../testbed/__fixtures__/counter.smart.c"), "utf8");

describe("generateLabels", () => {
  it("names, types, arrays, structs and scopes", () => {
    const r = generateLabels(typed);
    if (!r.ok) throw new Error(r.error.message);
    const byName = Object.fromEntries(r.labels.slots.map((s) => [s.name, s]));
    expect(r.labels.typed).toBe(true);
    expect(r.labels.codeHash).toMatch(/^\d+$/);
    expect(byName["counter"]).toMatchObject({ format: "long", origin: "compiler" });
    expect(byName["rate"]).toMatchObject({ format: "fixed" });
    expect(byName["sale.price"]).toBeDefined();
    expect(byName["sale.owner"]).toBeDefined();
    expect(byName["helper.local"]).toBeDefined();
    expect(byName["ptr"]).toMatchObject({ format: "unsigned" });
    const prices = r.labels.slots.filter((s) => s.name === "prices");
    expect(prices).toHaveLength(2);
    expect(prices[1]).toMatchObject({ length: 3, format: "long" });
    expect(prices[1]!.index).toBe(prices[0]!.index + 1);
    // registers and compiler constants are not user memory
    expect(r.labels.slots.some((s) => /^r\d+$/.test(s.name) || s.name.startsWith("f1"))).toBe(false);
  });

  it("emits code labels without compiler-internal ones", () => {
    const r = generateLabels(typed);
    if (!r.ok) throw new Error(r.error.message);
    expect(r.labels.codeLabels.every((l) => !l.name.startsWith("__"))).toBe(true);
  });

  it("works on the testbed counter fixture", () => {
    expect(generateLabels(counter).ok).toBe(true);
  });

  it("returns a positioned compile error", () => {
    const r = generateLabels("long a = ;");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error.line).toBeGreaterThan(0);
  });
});

describe("fallback", () => {
  it("maps plain names to slot positions without formats", () => {
    expect(slotsFromNames(["r0", "counter", "rate"])).toEqual([
      { index: 1, name: "counter", origin: "compiler" },
      { index: 2, name: "rate", origin: "compiler" },
    ]);
  });
});
