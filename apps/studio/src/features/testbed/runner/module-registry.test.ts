import { describe, it, expect } from "bun:test";
import { createRegistry, buildModuleSource } from "./module-registry";

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

  it("serves a ?raw import as the file text", () => {
    const registry = createRegistry({
      modules: {
        "/proj/tests/a.ts": {
          js: `const c = require("../counter.smart.c?raw"); exports.code = c.default;`,
        },
      },
      rawFiles: { "/proj/counter.smart.c": "#program name Counter" },
      virtuals: {},
    });
    expect((registry.require("/proj/tests/a.ts") as any).code).toBe("#program name Counter");
  });

  it("marks the ?raw module as __esModule so TS default-interop works", () => {
    const registry = createRegistry({
      modules: {
        "/proj/a.ts": {
          js: `var __importDefault = (this && this.__importDefault) || function (mod) {
                 return (mod && mod.__esModule) ? mod : { "default": mod };
               };
               const c = __importDefault(require("./x.smart.c?raw"));
               exports.code = c.default;`,
        },
      },
      rawFiles: { "/proj/x.smart.c": "SOURCE" },
      virtuals: {},
    });
    expect((registry.require("/proj/a.ts") as any).code).toBe("SOURCE");
  });

  it("lists sibling files when a ?raw import misses", () => {
    const registry = createRegistry({
      modules: { "/proj/tests/a.ts": { js: `require("../typo.smart.c?raw");` } },
      rawFiles: { "/proj/counter.smart.c": "x", "/proj/token.smart.c": "y" },
      virtuals: {},
    });
    expect(() => registry.require("/proj/tests/a.ts")).toThrow(
      /\/proj\/typo\.smart\.c.*counter\.smart\.c.*token\.smart\.c/s,
    );
  });
});

describe("value tracing", () => {
  it("gives each module a __v bound to its own path", () => {
    const seen: Array<[string, number, string, unknown]> = [];
    const registry = createRegistry({
      modules: { "/p/a.ts": { js: `module.exports.x = __v(3,"x", 7);` } },
      rawFiles: {},
      virtuals: {},
      trace: {
        value: (file, line, name, value) => {
          seen.push([file, line, name, value]);
          return value;
        },
        ok: () => {},
        endTest: () => ({ trace: {}, truncated: false }),
      },
    });

    expect((registry.require("/p/a.ts") as { x: number }).x).toBe(7);
    expect(seen).toEqual([["/p/a.ts", 3, "x", 7]]);
  });

  it("gives each module an __ok bound to its own path", () => {
    const seen: Array<[string, number]> = [];
    const registry = createRegistry({
      modules: { "/p/a.ts": { js: `__ok(9);` } },
      rawFiles: {},
      virtuals: {},
      trace: {
        value: (_f, _l, _n, v) => v,
        ok: (file, line) => void seen.push([file, line]),
        endTest: () => ({ trace: {}, truncated: false }),
      },
    });

    registry.require("/p/a.ts");
    expect(seen).toEqual([["/p/a.ts", 9]]);
  });

  it("still evaluates instrumented code when no sink is supplied", () => {
    const registry = createRegistry({
      modules: { "/p/a.ts": { js: `module.exports.x = __v(1,"x", 7); __ok(1);` } },
      rawFiles: {},
      virtuals: {},
    });

    expect((registry.require("/p/a.ts") as { x: number }).x).toBe(7);
  });
});

describe("buildModuleSource", () => {
  const MAP = JSON.stringify({ version: 3, sources: ["a.ts"], names: [], mappings: "" });

  it("names the module so it appears under its real path in DevTools", () => {
    expect(buildModuleSource(`module.exports.x = 1;`, "/p/a.ts", MAP)).toContain(
      "//# sourceURL=/p/a.ts",
    );
  });

  it("appends an inline sourceMappingURL when a map is available", () => {
    expect(buildModuleSource(`module.exports.x = 1;`, "/p/a.ts", MAP)).toContain(
      "//# sourceMappingURL=data:application/json;charset=utf-8;base64,",
    );
  });

  it("keeps the original code first", () => {
    expect(
      buildModuleSource(`module.exports.x = 1;`, "/p/a.ts", MAP).startsWith("module.exports.x = 1;"),
    ).toBe(true);
  });

  it("omits the sourceMappingURL when there is no map", () => {
    const built = buildModuleSource(`module.exports.x = 1;`, "/p/a.ts", undefined);
    expect(built).toContain("//# sourceURL=/p/a.ts");
    expect(built).not.toContain("sourceMappingURL");
  });

  it("round-trips non-ASCII through base64", () => {
    // `btoa` alone throws on any code point above 0xFF, so a map naming a file
    // with an umlaut is the case that catches a naive implementation.
    const map = JSON.stringify({ version: 3, sources: ["ü.ts"], names: [], mappings: "" });
    const encoded = buildModuleSource(`x`, "/p/a.ts", map).split("base64,")[1].trim();
    const decoded = new TextDecoder().decode(
      Uint8Array.from(atob(encoded), (char) => char.charCodeAt(0)),
    );
    expect(JSON.parse(decoded)).toEqual(JSON.parse(map));
  });
});
