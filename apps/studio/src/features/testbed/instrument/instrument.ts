import { parse } from "acorn";
import MagicString from "magic-string";
import { TraceMap, originalPositionFor } from "@jridgewell/trace-mapping";

/** A range to wrap, or (when start === end) a marker to insert. */
interface Edit {
  start: number;
  end: number;
  prefix: string;
  suffix: string;
}

/** Any AST node. acorn's own types are structural and awkward to narrow. */
type Node = Record<string, any>;

/**
 * Walks every node in the tree, in no particular order.
 *
 * Written out rather than pulling in `acorn-walk` because edits are collected
 * and sorted before being applied, so traversal order is irrelevant — and not
 * depending on a library's order is one less thing to be wrong about.
 */
function visit(node: unknown, fn: (node: Node) => void): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) visit(child, fn);
    return;
  }
  const record = node as Node;
  if (typeof record.type === "string") fn(record);
  for (const key of Object.keys(record)) {
    if (key === "loc" || key === "start" || key === "end" || key === "range") continue;
    visit(record[key], fn);
  }
}

function safeTraceMap(raw: string): TraceMap | null {
  try {
    return new TraceMap(JSON.parse(raw));
  } catch {
    return null;
  }
}

/**
 * Rewrites emitted JavaScript so every binding reports its value.
 *
 * Guarantees the output has exactly as many lines as the input: every insert is
 * a single-line snippet. That keeps the existing TS→JS sourcemap valid for line
 * lookups, so nothing downstream needs a composed map.
 *
 * Line numbers are resolved here, once, and baked into the emitted calls — the
 * runtime never maps anything.
 *
 * Returns the input unchanged if it cannot be parsed. Inline values are a
 * convenience layered on top of a working test run, and must never cost one.
 */
export function instrument(js: string, sourceMap?: string): string {
  let ast: Node;
  try {
    ast = parse(js, { ecmaVersion: "latest", sourceType: "script", locations: true }) as Node;
  } catch {
    return js;
  }

  const map = sourceMap ? safeTraceMap(sourceMap) : null;

  /** The line to report for a node: the original TypeScript line where possible. */
  function lineFor(node: Node): number {
    const generated = node.loc.start.line as number;
    if (!map) return generated;
    const original = originalPositionFor(map, {
      line: generated,
      column: node.loc.start.column as number,
    });
    return original.line ?? generated;
  }

  const edits: Edit[] = [];

  visit(ast, (node) => {
    if (node.type === "VariableDeclarator" && node.init && node.id?.type === "Identifier") {
      edits.push({
        start: node.init.start,
        end: node.init.end,
        prefix: `__v(${lineFor(node)},${JSON.stringify(node.id.name)}, `,
        suffix: ")",
      });
      return;
    }

    if (node.type === "AssignmentExpression" && node.left?.type === "Identifier") {
      // The whole assignment is wrapped, not just the right-hand side, so a
      // compound operator reports the resulting value rather than the operand.
      edits.push({
        start: node.start,
        end: node.end,
        prefix: `__v(${lineFor(node)},${JSON.stringify(node.left.name)}, `,
        suffix: ")",
      });
    }
  });

  return applyEdits(js, edits);
}

/**
 * Applies edits outermost-first, so a wrap that contains another ends up outside
 * it. Sorting here means the result does not depend on the order nodes were
 * visited in, nor on magic-string's internal insertion rules beyond the
 * documented appendLeft/prependRight pairing.
 */
export function applyEdits(js: string, edits: Edit[]): string {
  if (edits.length === 0) return js;

  const ordered = [...edits].sort((a, b) => a.start - b.start || b.end - a.end);
  const output = new MagicString(js);

  for (const edit of ordered) {
    if (edit.prefix) output.appendLeft(edit.start, edit.prefix);
    if (edit.suffix) output.prependRight(edit.end, edit.suffix);
  }

  return output.toString();
}
