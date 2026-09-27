import type { CellTone } from "./rail-cells";

/**
 * How a stop on the track is drawn.
 *
 * The mark carries the *fact*, never the progress: a filled diamond means the
 * stage reported something good or something bad, and a hollow one means it
 * has not answered. "Done" is deliberately unsayable — it is the step-number
 * claim the rail exists to avoid, and the first three stages never finish
 * anyway, they repeat.
 */
export function railMark(tone: CellTone): { fill: string; stroke: string } {
  if (tone === "good") return { fill: "var(--green)", stroke: "var(--green)" };
  if (tone === "bad") return { fill: "var(--mag)", stroke: "var(--mag)" };
  return { fill: "none", stroke: "var(--dim)" };
}
