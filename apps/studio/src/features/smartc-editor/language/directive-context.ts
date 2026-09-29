/**
 * Where the cursor sits on a preprocessor line:
 * - `directive`: right after `#`, the directive name itself is being typed
 *   (`startColumn` is the 1-based column of the `#`, so the range can overwrite it)
 * - `property`: after `#program`/`#pragma`/`#include`, the property name is being typed
 * - `value`: inside the value of such a directive — no code symbols apply here
 */
import type { DirectiveName } from "../language-definitions/directives";

export type DirectiveContext =
  | { kind: "directive"; startColumn: number }
  | { kind: "property"; directive: DirectiveName }
  | { kind: "value" };

const DIRECTIVE_NAME = /^(\s*)#\s*\w*$/;
const PROPERTY_NAME = /^\s*#\s*(program|pragma|include)\s+\w*$/;
const DIRECTIVE_LINE = /^\s*#\s*(program|pragma|include)\b/;

/** Classifies `lineToCursor` (line content from column 1 up to the cursor). */
export function matchDirectiveContext(
  lineToCursor: string,
): DirectiveContext | null {
  const name = DIRECTIVE_NAME.exec(lineToCursor);
  if (name) return { kind: "directive", startColumn: name[1].length + 1 };

  const property = PROPERTY_NAME.exec(lineToCursor);
  if (property)
    return { kind: "property", directive: property[1] as DirectiveName };

  if (DIRECTIVE_LINE.test(lineToCursor)) return { kind: "value" };

  return null;
}
