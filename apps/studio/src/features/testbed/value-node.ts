import { serializeValue } from "./serialize-value";

/**
 * A value captured as a tree rather than a string, so the Value tab can render
 * it collapsibly.
 *
 * Every member is a plain object, array or string, which matters twice over: it
 * survives structured clone on the way out of the worker, and it holds no
 * reference to the value it describes — the same reason values are serialised
 * at capture time rather than at render time.
 */
export type ValueNode =
  | { kind: "leaf"; text: string }
  | { kind: "object"; ctor?: string; entries: Array<{ key: string; value: ValueNode }> }
  | { kind: "array"; items: ValueNode[] };

/** Deep enough to reach through a testbed; collapsing handles the visual load. */
const MAX_DEPTH = 8;

/** A ceiling on total nodes, so one enormous graph cannot dominate a trace. */
const MAX_NODES = 2_000;

export interface DescribeOptions {
  maxDepth?: number;
  maxNodes?: number;
}

/**
 * Converts any value into a `ValueNode` tree.
 *
 * Total by construction: a throwing getter, a cycle or a hostile proxy yields a
 * placeholder leaf, never an exception that would escape into user code.
 */
export function describeValue(value: unknown, options: DescribeOptions = {}): ValueNode {
  const { maxDepth = MAX_DEPTH, maxNodes = MAX_NODES } = options;
  const seen = new WeakSet<object>();
  let nodes = 0;

  function walk(v: unknown, depth: number): ValueNode {
    nodes += 1;
    if (nodes > maxNodes) return { kind: "leaf", text: "…" };

    // Primitives, functions and symbols all render exactly as they do inline.
    if (v === null || typeof v !== "object") return { kind: "leaf", text: serializeValue(v) };

    // Only a genuine cycle is [Circular]; the entry is released on the way out
    // so two siblings pointing at the same object both render in full.
    if (seen.has(v)) return { kind: "leaf", text: "[Circular]" };
    if (depth >= maxDepth) return { kind: "leaf", text: Array.isArray(v) ? "[Array]" : "[Object]" };

    // Collections describe themselves better than their innards do.
    if (v instanceof Map) return { kind: "leaf", text: `Map(${v.size})` };
    if (v instanceof Set) return { kind: "leaf", text: `Set(${v.size})` };
    if (v instanceof Error) return { kind: "leaf", text: `${v.name}: ${v.message}` };

    seen.add(v);
    try {
      if (Array.isArray(v)) {
        return { kind: "array", items: v.map((item) => walk(item, depth + 1)) };
      }

      const entries: Array<{ key: string; value: ValueNode }> = [];
      for (const key of Object.keys(v)) {
        let child: ValueNode;
        try {
          child = walk((v as Record<string, unknown>)[key], depth + 1);
        } catch {
          child = { kind: "leaf", text: "<throws>" };
        }
        entries.push({ key, value: child });
      }

      const ctor = (v as object).constructor?.name;
      return ctor && ctor !== "Object" ? { kind: "object", ctor, entries } : { kind: "object", entries };
    } catch {
      return { kind: "leaf", text: "<throws>" };
    } finally {
      seen.delete(v);
    }
  }

  return walk(value, 0);
}

const INDENT = "  ";
const IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Renders a node as indented JavaScript-literal source, for display in a
 * read-only editor.
 *
 * JavaScript rather than JSON because contract values are full of bigints:
 * `amount: 200000000n` is a literal here, where JSON would have to lie about
 * the type or quote it into a string. A class name becomes a leading comment,
 * so the text stays valid and the editor highlights it as an aside.
 *
 * Empty objects and arrays stay on one line — there is nothing to fold, and a
 * fold marker on `{}` is just noise.
 */
export function toSourceText(node: ValueNode, depth = 0): string {
  if (node.kind === "leaf") return node.text;

  const pad = INDENT.repeat(depth);
  const inner = INDENT.repeat(depth + 1);

  if (node.kind === "array") {
    if (node.items.length === 0) return "[]";
    const items = node.items.map((item) => `${inner}${toSourceText(item, depth + 1)},`);
    return `[\n${items.join("\n")}\n${pad}]`;
  }

  const prefix = node.ctor ? `/* ${node.ctor} */ ` : "";
  if (node.entries.length === 0) return `${prefix}{}`;

  const entries = node.entries.map(({ key, value }) => {
    const name = IDENTIFIER.test(key) ? key : JSON.stringify(key);
    return `${inner}${name}: ${toSourceText(value, depth + 1)},`;
  });
  return `${prefix}{\n${entries.join("\n")}\n${pad}}`;
}
