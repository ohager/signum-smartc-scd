/**
 * What the cursor is pointing at on a `^...` assembler directive line:
 * - `directive`: the directive name itself, e.g. `program` in `^program name X`
 * - `property`: the property name that follows it, e.g. `name`
 *
 * Anything else on the line (the value, a stray token) yields `null`, so a word
 * like `name` used as an ordinary label elsewhere is never mistaken for a
 * directive property.
 */
export type AsmDirectiveTarget =
  | { kind: "directive"; name: string }
  | { kind: "property"; directive: string; name: string };

const DIRECTIVE_LINE = /^(\s*)\^(\w+)/;
const PROPERTY = /^(\s+)(\w+)/;

/**
 * @param line full text of the hovered line
 * @param wordStartColumn 1-based start column of the hovered word
 */
export function matchAsmDirectiveTarget(
  line: string,
  wordStartColumn: number,
): AsmDirectiveTarget | null {
  const directiveMatch = DIRECTIVE_LINE.exec(line);
  if (!directiveMatch) return null;

  const [, indent, directive] = directiveMatch;
  // +2 skips the indent and the '^' to land on the directive name (1-based).
  const directiveColumn = indent.length + 2;
  if (wordStartColumn === directiveColumn) {
    return { kind: "directive", name: directive };
  }

  const afterDirective = line.slice(directiveColumn - 1 + directive.length);
  const propertyMatch = PROPERTY.exec(afterDirective);
  if (!propertyMatch) return null;

  const [, gap, property] = propertyMatch;
  const propertyColumn = directiveColumn + directive.length + gap.length;
  if (wordStartColumn === propertyColumn) {
    return { kind: "property", directive, name: property };
  }
  return null;
}
