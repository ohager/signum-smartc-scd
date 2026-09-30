import type { DocError } from "./jsonc";
import type { LabelMap } from "./label-map";

/**
 * Which Label Map describes a contract. A pin in the watchlist wins; otherwise
 * every valid map in the workspace that lists the contract's code hash is a
 * candidate. A pin that no longer points at a valid file is reported rather
 * than silently dropped, so the UI can offer to fix it.
 */

export interface IndexedLabelMap {
  fileId: string;
  path: string;
  name: string;
  /** Null when the file does not parse or validate. */
  map: LabelMap | null;
  errors: DocError[];
}

export type Resolution =
  | { kind: "pinned" | "hash"; entry: IndexedLabelMap; pinnedMissing?: string }
  | { kind: "ambiguous"; candidates: IndexedLabelMap[]; pinnedMissing?: string }
  | { kind: "none"; pinnedMissing?: string };

function findPinned(pinned: string, maps: IndexedLabelMap[]): IndexedLabelMap | null {
  const valid = maps.filter((m) => m.map);
  const byPath = valid.find((m) => m.path === pinned);
  if (byPath) return byPath;
  const byName = valid.filter((m) => m.name === pinned);
  return byName.length === 1 ? byName[0]! : null;
}

export function resolveLabelMap(
  codeHash: string,
  pinned: string | undefined,
  maps: IndexedLabelMap[],
): Resolution {
  if (pinned) {
    const entry = findPinned(pinned, maps);
    if (entry) return { kind: "pinned", entry };
  }
  const missing = pinned ? { pinnedMissing: pinned } : {};
  const candidates = maps.filter((m) => m.map?.codeHashes.some((h) => h.hash === codeHash));
  if (candidates.length === 1) return { kind: "hash", entry: candidates[0]!, ...missing };
  if (candidates.length > 1) return { kind: "ambiguous", candidates, ...missing };
  return { kind: "none", ...missing };
}
