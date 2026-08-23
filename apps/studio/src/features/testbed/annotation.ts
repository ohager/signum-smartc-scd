import type { LineTrace } from "./runner/trace";

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

  if (count <= 1) return { text: label };

  const dropped = count - values.length;
  const lines = values.map((value, index) => `${dropped + index + 1}: ${value}`);
  const header = dropped > 0 ? `showing last ${values.length} of ${count}\n\n` : "";

  return { text: `${label}  ×${count}`, hover: header + lines.join("\n\n") };
}
