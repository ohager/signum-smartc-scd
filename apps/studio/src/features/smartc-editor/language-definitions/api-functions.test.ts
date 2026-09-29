import { describe, it, expect } from "bun:test";
import { SmartCApiFunctions, SmartCFixedApiFunctions } from "./api-functions";
import type { FunctionDeclaration } from "./functions";

/**
 * The declarations are written by hand for the docs, but their names, return
 * types and arities must match what the compiler accepts. This re-reads the
 * compiler's own API tables, so an upgrade that adds or renames a function
 * fails here instead of leaving autocompletion offering calls that no longer
 * compile.
 */
const TEMPLATES = require.resolve(
  "smartc-signum-compiler/dist/shaper/templates.js",
);

type TemplateEntry = {
  name: string;
  declaration: string;
  argsMemObj: { declaration: string }[];
};

const { APITableTemplate, fixedAPITableTemplate } = (await import(
  TEMPLATES
)) as { APITableTemplate: TemplateEntry[]; fixedAPITableTemplate: TemplateEntry[] };

function shape(entry: TemplateEntry) {
  const args = entry.argsMemObj.map((a) => a.declaration).join(", ");
  return `${entry.declaration} ${entry.name}(${args})`;
}

/** `long Set_A1_A2(long first, long second)` → `long Set_A1_A2(long, long)` */
function declared(fns: Record<string, FunctionDeclaration>) {
  return Object.values(fns).map((f) =>
    f.signature.replace(/\((.*)\)/, (_, args: string) =>
      `(${args
        .split(",")
        .map((a) => a.trim().split(/\s+/)[0])
        .filter(Boolean)
        .join(", ")})`,
    ),
  );
}

describe("low-level API declarations", () => {
  it("match the compiler's APIFunctions table", () => {
    expect(declared(SmartCApiFunctions).sort()).toEqual(
      APITableTemplate.map(shape).sort(),
    );
  });

  it("match the compiler's fixedAPIFunctions table", () => {
    expect(declared(SmartCFixedApiFunctions).sort()).toEqual(
      fixedAPITableTemplate.map(shape).sort(),
    );
  });

  it("are keyed by their own name and document every parameter", () => {
    for (const fns of [SmartCApiFunctions, SmartCFixedApiFunctions]) {
      for (const [name, fn] of Object.entries(fns)) {
        expect(fn.signature).toContain(` ${name}(`);
        expect(fn.documentation.length).toBeGreaterThan(0);
        const arity = /\(\s*\)/.test(fn.signature)
          ? 0
          : fn.signature.split(",").length;
        expect(fn.params.length).toBe(arity);
      }
    }
  });
});
