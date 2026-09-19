/** What the user chose, or null if they never said. */
export type MotionChoice = "on" | "off" | null;

/**
 * Someone who turned motion on did so knowing what their system says. The
 * override therefore works in both directions, not just towards less.
 */
export function resolveMotion(
  chosen: MotionChoice,
  prefersReduced: boolean,
): "on" | "off" {
  if (chosen !== null) return chosen;
  return prefersReduced ? "off" : "on";
}
