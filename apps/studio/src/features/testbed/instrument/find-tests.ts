import { parse } from "acorn";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";
import { unwrapSequence, type Node } from "./ast";

export type FoundTestMode = "run" | "skip" | "only" | "todo";

export interface FoundTest {
  /** The test's own name. */
  name: string;
  /** Enclosing suite names plus the test's own — the runner's filter key. */
  path: string[];
  /** 1-based line of the `it()` in the user's TypeScript. */
  line: number;
  /** 1-based line the test closes on, so a cursor position can resolve into it. */
  endLine: number;
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

  function lineAt(position: { line: number; column: number }): number {
    if (!map) return position.line;
    const original = originalPositionFor(map, { line: position.line, column: position.column });
    return original.line ?? position.line;
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
            line: lineAt(record.loc.start),
            endLine: Math.max(lineAt(record.loc.start), lineAt(record.loc.end)),
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

/**
 * The test a line sits inside, or undefined between and outside tests.
 *
 * Picks the tightest containing range. Real source cannot nest tests, but a
 * sourcemap can collapse two onto overlapping lines, and the widest match would
 * be the wrong answer there.
 */
export function testAtLine(tests: FoundTest[], line: number): FoundTest | undefined {
  let best: FoundTest | undefined;
  for (const test of tests) {
    if (line < test.line || line > test.endLine) continue;
    if (!best || test.endLine - test.line < best.endLine - best.line) best = test;
  }
  return best;
}
