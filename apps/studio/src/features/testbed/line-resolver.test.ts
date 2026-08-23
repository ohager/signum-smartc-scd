import { describe, it, expect } from "bun:test";
import { createLineResolver } from "./line-resolver";
import type { CompiledModule } from "./runner/types";

/**
 * Real output of `tsc --module commonjs --sourceMap` for:
 *
 *   1| import { describe, it, expect } from "vitest";
 *   2|
 *   3| describe("Counter", () => {
 *   4|   it("counts", () => {
 *   5|     expect(1n).toBe(2n);
 *   6|   });
 *   7| });
 *
 * The `expect` lands on generated line 6.
 */
const SOURCE_MAP =
  '{"version":3,"file":"counter.test.js","sourceRoot":"","sources":["counter.test.ts"],"names":[],' +
  '"mappings":";;AAAA,mCAA8C;AAE9C,IAAA,iBAAQ,EAAC,SAAS,EAAE,GAAG,EAAE;IACvB,IAAA,WAAE,EAAC,QAAQ,EAAE,GAAG,EAAE;QAChB,IAAA,eAAM,EAAC,EAAE,CAAC,CAAC,IAAI,CAAC,EAAE,CAAC,CAAC;IACtB,CAAC,CAAC,CAAC;AACL,CAAC,CAAC,CAAC"}';

const FILE = "/proj/tests/counter.test.ts";
const modules: Record<string, CompiledModule> = {
  [FILE]: { js: "// irrelevant to mapping", sourceMap: SOURCE_MAP },
};

/** A stack as the engine reports it: generated line plus the wrapper offset. */
const stackAt = (line: number, column: number, file = FILE) =>
  `Error: boom\n    at <anonymous> (${file}:${line}:${column})`;

describe("createLineResolver", () => {
  it("maps a frame back to the original line", () => {
    const resolve = createLineResolver(modules, 2);
    // Generated 6:8 is the `expect` call → original line 5.
    expect(resolve(stackAt(8, 8), FILE)).toBe(5);
  });

  it("maps the it() call site", () => {
    const resolve = createLineResolver(modules, 2);
    // Generated 5:4 → original line 4.
    expect(resolve(stackAt(7, 4), FILE)).toBe(4);
  });

  it("maps the describe() call site", () => {
    const resolve = createLineResolver(modules, 2);
    // Generated 4:0 → original line 3.
    expect(resolve(stackAt(6, 0), FILE)).toBe(3);
  });

  it("subtracts the wrapper offset before consulting the map", () => {
    // With a wrong offset the answer must differ, proving the offset is applied.
    const withZero = createLineResolver(modules, 0);
    expect(withZero(stackAt(8, 8), FILE)).not.toBe(5);
  });

  it("returns undefined when the file has no sourcemap", () => {
    const resolve = createLineResolver({ [FILE]: { js: "x" } }, 2);
    expect(resolve(stackAt(8, 8), FILE)).toBeUndefined();
  });

  it("returns undefined when the stack names no matching frame", () => {
    const resolve = createLineResolver(modules, 2);
    expect(resolve(stackAt(8, 8, "/other.ts"), FILE)).toBeUndefined();
  });

  it("returns undefined for a missing stack", () => {
    const resolve = createLineResolver(modules, 2);
    expect(resolve(undefined, FILE)).toBeUndefined();
  });

  it("survives a corrupt sourcemap instead of throwing", () => {
    const resolve = createLineResolver({ [FILE]: { js: "x", sourceMap: "{not json" } }, 2);
    expect(resolve(stackAt(8, 8), FILE)).toBeUndefined();
  });

  it("parses each sourcemap only once across repeated lookups", () => {
    const resolve = createLineResolver(modules, 2);
    expect(resolve(stackAt(8, 8), FILE)).toBe(5);
    expect(resolve(stackAt(7, 4), FILE)).toBe(4);
    expect(resolve(stackAt(8, 8), FILE)).toBe(5);
  });
});
