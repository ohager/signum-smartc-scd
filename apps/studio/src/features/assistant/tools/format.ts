/*
 * Output shaping shared by the tools. Line numbers let the agent cite and edit by
 * position; the size caps keep one call from flooding the model's context.
 */

export const MAX_READ_LINES = 2000;

/** Lines `from..to` (1-based, inclusive) of `text`, each as `"%5d| line"`. */
export function numberLines(text: string, from: number, to: number): string {
  const lines = text.split("\n");
  const out: string[] = [];
  for (let n = Math.max(from, 1); n <= Math.min(to, lines.length); n++) {
    out.push(`${String(n).padStart(5)}| ${lines[n - 1]}`);
  }
  return out.join("\n");
}

/** Cuts `text` to at most `max` characters and says whether it did. */
export function truncate(text: string, max: number): { text: string; truncated: boolean } {
  if (text.length <= max) return { text, truncated: false };
  return { text: text.slice(0, max), truncated: true };
}
