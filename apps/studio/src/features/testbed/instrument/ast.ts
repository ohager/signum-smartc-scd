/**
 * acorn helpers shared by the instrumenter and the test scanner.
 *
 * Both walk emitted CommonJS, where TypeScript has rewritten every imported
 * call as `(0, ns.fn)(...)`. Keeping the unwrapping in one place is deliberate:
 * a matcher that only recognised the bare form once shipped a marker that never
 * fired in the app while passing every unit test.
 */

/** Any AST node. acorn's own types are structural and awkward to narrow. */
export type Node = Record<string, any>;

export const FUNCTION_TYPES = new Set([
  "FunctionDeclaration",
  "FunctionExpression",
  "ArrowFunctionExpression",
]);

/**
 * Walks every node in the tree, in no particular order, reporting whether each
 * one sits inside a function body.
 *
 * Written out rather than pulling in `acorn-walk` because edits are collected
 * and sorted before being applied, so traversal order is irrelevant — and not
 * depending on a library's order is one less thing to be wrong about.
 */
export function visit(
  node: unknown,
  fn: (node: Node, insideFunction: boolean) => void,
  insideFunction = false,
): void {
  if (!node || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const child of node) visit(child, fn, insideFunction);
    return;
  }
  const record = node as Node;
  if (typeof record.type === "string") fn(record, insideFunction);

  const childrenInside = insideFunction || FUNCTION_TYPES.has(record.type as string);
  for (const key of Object.keys(record)) {
    if (key === "loc" || key === "start" || key === "end" || key === "range") continue;
    visit(record[key], fn, childrenInside);
  }
}

/** Unwraps `(0, x)`, which is what TypeScript emits for a namespaced import. */
export function unwrapSequence(node: Node): Node {
  let current = node;
  while (current?.type === "SequenceExpression") {
    const parts = current.expressions as Node[];
    current = parts[parts.length - 1];
  }
  return current;
}

/**
 * The name of the function a call chain starts from.
 *
 * Both `expect(a).toBe(b)` and the compiled `(0, vitest_1.expect)(a).toBe(b)`
 * answer "expect" — which matters because the instrumenter only ever sees the
 * compiled form, where a bare `expect` identifier never appears.
 */
export function chainRootName(node: Node): string | null {
  let current: Node | null = unwrapSequence(node);

  while (current) {
    if (current.type === "CallExpression") {
      current = unwrapSequence(current.callee as Node);
      continue;
    }

    if (current.type === "MemberExpression") {
      const object = unwrapSequence(current.object as Node);
      // A namespaced import bottoms out at a plain identifier, and the name
      // worth reporting is the property: `vitest_1.expect` is "expect".
      if (object.type === "Identifier") {
        return ((current.property as Node)?.name as string) ?? (object.name as string);
      }
      current = object;
      continue;
    }

    return current.type === "Identifier" ? (current.name as string) : null;
  }

  return null;
}
