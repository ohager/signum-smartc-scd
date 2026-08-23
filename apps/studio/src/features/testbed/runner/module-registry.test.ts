import { describe, it, expect } from "bun:test";
import { createRegistry } from "./module-registry";

describe("module-registry", () => {
  it("evaluates a module and returns its exports", () => {
    const registry = createRegistry({
      modules: { "/proj/a.ts": { js: `exports.value = 42;` } },
      rawFiles: {},
      virtuals: {},
    });
    expect((registry.require("/proj/a.ts") as any).value).toBe(42);
  });

  it("resolves a relative import between modules", () => {
    const registry = createRegistry({
      modules: {
        "/proj/a.ts": { js: `const b = require("./b"); exports.value = b.value + 1;` },
        "/proj/b.ts": { js: `exports.value = 1;` },
      },
      rawFiles: {},
      virtuals: {},
    });
    expect((registry.require("/proj/a.ts") as any).value).toBe(2);
  });

  it("resolves a parent-directory import", () => {
    const registry = createRegistry({
      modules: {
        "/proj/tests/a.ts": { js: `const h = require("../helper"); exports.value = h.value;` },
        "/proj/helper.ts": { js: `exports.value = "shared";` },
      },
      rawFiles: {},
      virtuals: {},
    });
    expect((registry.require("/proj/tests/a.ts") as any).value).toBe("shared");
  });

  it("evaluates each module only once", () => {
    const registry = createRegistry({
      modules: {
        "/proj/a.ts": { js: `require("./b"); require("./b"); exports.ok = true;` },
        "/proj/b.ts": { js: `globalThis.__evals = (globalThis.__evals ?? 0) + 1;` },
      },
      rawFiles: {},
      virtuals: {},
    });
    (globalThis as any).__evals = 0;
    registry.require("/proj/a.ts");
    expect((globalThis as any).__evals).toBe(1);
  });

  it("survives a circular import by exposing partial exports", () => {
    const registry = createRegistry({
      modules: {
        "/proj/a.ts": {
          js: `exports.name = "a"; const b = require("./b"); exports.fromB = b.name; exports.late = "set-after";`,
        },
        "/proj/b.ts": {
          js: `const a = require("./a"); exports.name = "b"; exports.sawName = a.name; exports.sawLate = a.late;`,
        },
      },
      rawFiles: {},
      virtuals: {},
    });
    const a = registry.require("/proj/a.ts") as any;
    const b = registry.require("/proj/b.ts") as any;
    expect(a.fromB).toBe("b");
    expect(b.sawName).toBe("a");        // saw what `a` had exported so far
    expect(b.sawLate).toBeUndefined();  // did not see what `a` exported later
  });

  it("resolves a bare specifier to a virtual module", () => {
    const registry = createRegistry({
      modules: { "/proj/a.ts": { js: `const v = require("vitest"); exports.value = v.marker;` } },
      rawFiles: {},
      virtuals: { vitest: { marker: "virtual" } },
    });
    expect((registry.require("/proj/a.ts") as any).value).toBe("virtual");
  });

  it("names the available virtuals when a bare specifier is unknown", () => {
    const registry = createRegistry({
      modules: { "/proj/a.ts": { js: `require("lodash");` } },
      rawFiles: {},
      virtuals: { vitest: {} },
    });
    expect(() => registry.require("/proj/a.ts")).toThrow(/lodash.*Available: vitest/s);
  });

  it("does not resolve Object.prototype members as virtual modules", () => {
    const registry = createRegistry({
      modules: { "/proj/a.ts": { js: `require("toString");` } },
      rawFiles: {},
      virtuals: { vitest: {} },
    });
    expect(() => registry.require("/proj/a.ts")).toThrow(/toString.*Available: vitest/s);
  });
});
