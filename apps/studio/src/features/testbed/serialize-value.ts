const MAX_DEPTH = 3;
const MAX_LENGTH = 200;
const INDENT = "  ";

export interface SerializeOptions {
  /** Quote a top-level string. False for console output, where `hi` beats `"hi"`. */
  quoteStrings?: boolean;
  maxLength?: number;
  /** How far into nested structures to descend before writing `[Object]`. */
  maxDepth?: number;
  /** Break objects and arrays across indented lines. For the detail view. */
  pretty?: boolean;
}

/**
 * Renders any value as a display string — one line by default, indented and
 * multi-line when `pretty`.
 *
 * Called at capture time rather than render time: holding a reference to a live
 * object and formatting it later would show its final state rather than its
 * state at the line being annotated, which is the exact lie inline values exist
 * to prevent.
 *
 * Total by construction — a throwing getter, a cycle or a hostile proxy yields a
 * placeholder, never an exception that would escape into user code.
 */
export function serializeValue(value: unknown, options: SerializeOptions = {}): string {
  const {
    quoteStrings = true,
    maxLength = MAX_LENGTH,
    maxDepth = MAX_DEPTH,
    pretty = false,
  } = options;
  const seen = new WeakSet<object>();

  /**
   * Joins members either inline or one per indented line.
   *
   * Braces get inner padding and brackets do not, matching how both are
   * conventionally written: `{ a: 1 }` but `[1, 2]`.
   */
  function group(parts: string[], open: string, close: string, depth: number): string {
    if (parts.length === 0) return open + close;
    if (!pretty) {
      const pad = open === "{" ? " " : "";
      return `${open}${pad}${parts.join(", ")}${pad}${close}`;
    }
    const inner = INDENT.repeat(depth + 1);
    return `${open}\n${inner}${parts.join(`,\n${inner}`)}\n${INDENT.repeat(depth)}${close}`;
  }

  function walk(v: unknown, depth: number): string {
    if (typeof v === "bigint") return `${v}n`;
    if (typeof v === "string") return depth === 0 && !quoteStrings ? v : JSON.stringify(v);
    if (v === null) return "null";
    if (v === undefined) return "undefined";
    if (typeof v === "symbol") return v.toString();
    if (typeof v === "function") return v.name ? `[Function: ${v.name}]` : "[Function]";
    if (typeof v !== "object") return String(v);

    // Only a genuine cycle is [Circular]; the entry is released on the way out so
    // two siblings pointing at the same object both render in full.
    if (seen.has(v)) return "[Circular]";
    if (depth >= maxDepth) return Array.isArray(v) ? "[Array]" : "[Object]";

    seen.add(v);
    try {
      if (Array.isArray(v)) {
        return group(
          v.map((item) => walk(item, depth + 1)),
          "[",
          "]",
          depth,
        );
      }
      if (v instanceof Map) return `Map(${v.size})`;
      if (v instanceof Set) return `Set(${v.size})`;
      if (v instanceof Error) return `${v.name}: ${v.message}`;

      const entries: string[] = [];
      for (const key of Object.keys(v)) {
        let rendered: string;
        try {
          rendered = walk((v as Record<string, unknown>)[key], depth + 1);
        } catch {
          rendered = "<throws>";
        }
        entries.push(`${key}: ${rendered}`);
      }

      const ctor = (v as object).constructor?.name;
      const prefix = ctor && ctor !== "Object" ? `${ctor} ` : "";
      return prefix + group(entries, "{", "}", depth);
    } catch {
      return "<throws>";
    } finally {
      seen.delete(v);
    }
  }

  let text: string;
  try {
    text = walk(value, 0);
  } catch {
    text = "<throws>";
  }
  return text.length > maxLength ? text.slice(0, maxLength - 1) + "…" : text;
}
