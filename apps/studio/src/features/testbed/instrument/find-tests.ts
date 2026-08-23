import { parse } from "acorn";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { unwrapSequence, type Node } from "./ast";

export type FoundTestMode = "run" | "skip" | "only" | "todo";

export interface FoundTest {
  /** The test's own name. */
  name: string;
  /** Enclosing suite names plus the test's own — the runner's filter key. */
  path: string[];
  /** 1-based line in the user's TypeScript. */
  line: number;
  mode: FoundTestMode;
}

const SUITES = new Set(["describe", "suite"]);
const TESTS = new Set(["it", "test"]);
const MODIFIERS = new Set(["only", "skip", "todo"]);

interface Called {
  base: string;
  modifier?: FoundTestMode;
}

/**
 * Resolves what a call is calling, across the three forms this has to survive:
 * `it(…)`, `it.skip(…)`, and the compiled `(0, vitest_1.it).skip(…)`.
 */
function resolveCallee(node: Node): Called | null {
  const callee = unwrapSequence(node);
  if (!callee) return null;

  if (callee.type === "Identifier") return { base: callee.name as string };

  if (callee.type === "MemberExpression") {
    const property = callee.property as Node;
    if (property?.type !== "Identifier") return null;

    if (MODIFIERS.has(property.name as string)) {
      const inner = resolveCallee(callee.object as Node);
      return inner ? { base: inner.base, modifier: property.name as FoundTestMode } : null;
    }

    // A namespaced import bottoms out at a plain identifier, and the name worth
    // reporting is the property: `vitest_1.it` is "it".
    const object = unwrapSequence(callee.object as Node);
    if (object?.type === "Identifier") return { base: property.name as string };
  }

  return null;
}

/** The first argument, when it is a plain string literal. */
function literalName(node: Node | undefined): string | null {
  if (node?.type !== "Literal") return null;
  return typeof node.value === "string" ? node.value : null;
}

function safeTraceMap(raw: string): TraceMap | null {
  try {
    return new TraceMap(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Finds every `it()` in emitted JavaScript, with the path a runner filter needs
 * and the line in the user's TypeScript.
 *
 * Runs against emitted JS rather than the editor buffer because acorn cannot
 * parse TypeScript — and because the emitted form is what the runner sees, so
 * both agree about what counts as a test.
 *
 * Returns nothing for source it cannot parse, so a half-typed file leaves the
 * previous result standing rather than clearing the gutter on every keystroke.
 */
export function findTests(js: string, sourceMap?: string): FoundTest[] {
  let ast: Node;
  try {
    ast = parse(js, { ecmaVersion: "latest", sourceType: "script", locations: true }) as Node;
  } catch {
    return [];
  }

  const map = sourceMap ? safeTraceMap(sourceMap) : null;

  function lineFor(node: Node): number {
    const generated = node.loc.start.line as number;
    if (!map) return generated;
    const original = originalPositionFor(map, {
      line: generated,
      column: node.loc.start.column as number,
    });
    return original.line ?? generated;
  }

  const found: FoundTest[] = [];

  function walk(node: unknown, path: string[]): void {
    if (!node || typeof node !== "object") return;

    if (Array.isArray(node)) {
      for (const child of node) walk(child, path);
      return;
    }

    const record = node as Node;

    if (record.type === "CallExpression") {
      const called = resolveCallee(record.callee as Node);
      const args = (record.arguments ?? []) as Node[];
      const name = literalName(args[0]);

      if (called && name !== null) {
        if (SUITES.has(called.base)) {
          // Descend with the extended path and stop: falling through to the
          // generic walk below would find this suite's tests a second time.
          if (args[1]) walk(args[1].body, [...path, name]);
          return;
        }

        if (TESTS.has(called.base)) {
          found.push({
            name,
            path: [...path, name],
            line: lineFor(record),
            mode: called.modifier ?? "run",
          });
          // A test inside a test is not a thing worth reporting.
          return;
        }
      }
    }

    for (const key of Object.keys(record)) {
      if (key === "loc" || key === "start" || key === "end" || key === "range") continue;
      walk(record[key], path);
    }
  }

  walk(ast, []);
  return found;
}
