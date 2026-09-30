/**
 * Saves that are waiting on a debounce. Anything about to throw the page away
 * — a language switch reloads it — flushes these first.
 */
const pending = new Set<() => unknown>();

export function registerPendingSave(flush: () => unknown): () => void {
  pending.add(flush);
  return () => pending.delete(flush);
}

export async function flushPendingSaves(): Promise<void> {
  // Through a promise, so a flush that throws synchronously is settled like one that rejects.
  const results = await Promise.allSettled(
    [...pending].map((flush) => Promise.resolve().then(flush)),
  );
  for (const r of results) {
    if (r.status === "rejected") console.error("[pending-saves] flush failed", r.reason);
  }
}
