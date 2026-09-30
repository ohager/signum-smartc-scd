import type { Messages } from "./runtime";

const PLURAL_CATEGORIES = new Set(["zero", "one", "two", "few", "many", "other"]);

/** A leaf whose keys are all CLDR plural categories, `other` among them. */
export function isPluralNode(node: unknown): node is Record<string, string> {
  if (typeof node !== "object" || node === null) return false;
  const keys = Object.keys(node);
  return (
    keys.length > 0 &&
    keys.every((k) => PLURAL_CATEGORIES.has(k)) &&
    typeof (node as Record<string, unknown>).other === "string"
  );
}

/** `{ a: { b: "x" } }` → `a.b → "x"`. Plural objects stay whole. */
export function flattenMessages(
  tree: Messages,
  prefix = "",
  out = new Map<string, string | Record<string, string>>(),
): Map<string, string | Record<string, string>> {
  for (const [key, node] of Object.entries(tree)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof node === "string" || isPluralNode(node)) out.set(path, node);
    else flattenMessages(node, path, out);
  }
  return out;
}
