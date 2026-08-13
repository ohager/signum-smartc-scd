/**
 * Where the cursor sits on a preprocessor line:
 * - `directive`: right after `#`, the directive name itself is being typed
 *   (`startColumn` is the 1-based column of the `#`, so the range can overwrite it)
 * - `property`: after `#program`/`#pragma`, the property name is being typed
 * - `value`: inside the value of a `#program`/`#pragma` — no code symbols apply here
 */
export type DirectiveContext =
  | { kind: "directive"; startColumn: number }
  | { kind: "property"; directive: "program" | "pragma" }
  | { kind: "value" };

const DIRECTIVE_NAME = /^(\s*)#\s*\w*$/;
const PROPERTY_NAME = /^\s*#\s*(program|pragma)\s+\w*$/;
const DIRECTIVE_LINE = /^\s*#\s*(program|pragma)\b/;

/** Classifies `lineToCursor` (line content from column 1 up to the cursor). */
export function matchDirectiveContext(
  lineToCursor: string,
): DirectiveContext | null {
  const name = DIRECTIVE_NAME.exec(lineToCursor);
  if (name) return { kind: "directive", startColumn: name[1].length + 1 };

  const property = PROPERTY_NAME.exec(lineToCursor);
  if (property)
    return { kind: "property", directive: property[1] as "program" | "pragma" };

  if (DIRECTIVE_LINE.test(lineToCursor)) return { kind: "value" };

  return null;
}
