import type { LineTrace } from "./runner/trace";

/**
 * How much of a value the inline text may show.
 *
 * Ghost text shares the line with the code it annotates, so a long value pushes
 * the annotation off the right edge and makes the file harder to read than it
 * was without it. The full value lives in the Value tab, one click away.
 */
const INLINE_MAX = 60;

export interface Annotation {
  /**
   * `ok` is a bare assertion tick with nothing behind it; `value` has a
   * captured value the Value tab can show. Only `value` is worth a click.
   */
  kind: "value" | "ok";
  /** Ghost text drawn at the end of the line. */
  text: string;
}

/**
 * Renders one line's trace as the text the editor draws beside it.
 *
 * Returns null when there is nothing worth drawing, so callers can filter
 * rather than render an empty decoration.
 */
export function formatAnnotation(trace: LineTrace): Annotation | null {
  const { values, count, name, ok } = trace;

  if (values.length === 0) {
    // A bare assertion marker is worth a tick; a binding whose value the budget
    // dropped is not worth an empty annotation.
    return ok ? { kind: "ok", text: "✓" } : null;
  }

  const last = values[values.length - 1];
  const label = name ? `${name} = ${last}` : last;
  const shortened = label.length > INLINE_MAX ? label.slice(0, INLINE_MAX - 1) + "…" : label;

  return { kind: "value", text: count > 1 ? `${shortened}  ×${count}` : shortened };
}
