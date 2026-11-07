import { loadLabelMaps, type WorkspaceFiles } from "@/features/inspector/workspace/label-map-index";
import type { IndexedLabelMap } from "@/features/inspector/model/resolve-label-map";

/**
 * Monaco providers are not React, so they cannot use `useLabelMaps`. The lint
 * only needs the maps to name deploy parameters, and a slightly stale set just
 * means a parameter label is missing until the next edit — so one module-level
 * copy, refreshed on file events, is enough.
 */

export interface LabelMapSource extends WorkspaceFiles {
  addEventListener(type: string, listener: () => void): void;
}

let cached: IndexedLabelMap[] = [];
let attachedTo: LabelMapSource | null = null;
let generation = 0;

export const getCachedLabelMaps = (): IndexedLabelMap[] => cached;

const listeners = new Set<() => void>();

/** Called when a refresh actually changed the maps. Returns an unsubscribe. */
export function onLabelMapsChanged(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const signature = (maps: IndexedLabelMap[]) => JSON.stringify(maps);

function apply(mine: number, next: IndexedLabelMap[]): void {
  if (mine !== generation) return;
  const changed = signature(next) !== signature(cached);
  cached = next;
  if (changed) listeners.forEach((l) => l());
}

function reload(fs: LabelMapSource): void {
  const mine = ++generation;
  loadLabelMaps(fs)
    .then((next) => apply(mine, next))
    .catch(() => apply(mine, []));
}

/** Idempotent: loads once, then follows `file:*` and `fs:reloaded`. */
export function ensureLabelMapCache(fs: LabelMapSource): void {
  if (attachedTo === fs) return;
  attachedTo = fs;
  reload(fs);
  fs.addEventListener("file:*", () => reload(fs));
  fs.addEventListener("fs:reloaded", () => reload(fs));
}

/** For tests: forget the source and the cached maps. */
export function resetLabelMapCache(): void {
  attachedTo = null;
  cached = [];
  generation++;
}
