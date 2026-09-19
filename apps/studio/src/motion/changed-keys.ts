/**
 * Which values changed since the last look.
 *
 * The rule that keeps a value flash meaningful: never on first sight. A panel
 * opening is not an event, and lighting up every row the moment it appears is
 * how this kind of animation turns into noise. A key that has only just
 * appeared counts as first sight too.
 */
export function changedKeys(
  before: Record<string, string> | undefined,
  after: Record<string, string>,
): Set<string> {
  if (!before) return new Set();

  const changed = new Set<string>();
  for (const [key, value] of Object.entries(after)) {
    if (key in before && before[key] !== value) changed.add(key);
  }

  return changed;
}
