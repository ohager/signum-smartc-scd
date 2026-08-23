import type { LineTrace } from "./runner/trace";

/**
 * How much of a value the inline text may show.
 *
 * Ghost text shares the line with the code it annotates, so a long value pushes
 * the annotation off the right edge and makes the file harder to read than it
 * was without it. Anything longer moves to the hover.
 */
const INLINE_MAX = 60;

export interface Annotation {
  /** Ghost text drawn at the end of the line. */
  text: string;
  /** Markdown shown on hover. Absent when the text says everything. */
  hover?: string;
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
    return ok ? { text: "✓" } : null;
  }

  const last = values[values.length - 1];
  const label = name ? `${name} = ${last}` : last;
  const shortened = label.length > INLINE_MAX ? label.slice(0, INLINE_MAX - 1) + "…" : label;

  // Anything the inline text could not say goes in the hover, in the order you
  // would want to read it: the full value first, then how the repeats ran.
  const hover: string[] = [];
  if (shortened !== label) hover.push(label);

  if (count > 1) {
    const dropped = count - values.length;
    if (dropped > 0) hover.push(`showing last ${values.length} of ${count}`);
    hover.push(values.map((value, index) => `${dropped + index + 1}: ${value}`).join("\n\n"));
  }

  const text = count > 1 ? `${shortened}  ×${count}` : shortened;
  return hover.length ? { text, hover: hover.join("\n\n") } : { text };
}
