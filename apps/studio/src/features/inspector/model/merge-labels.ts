import { editDocument } from "./jsonc";
import type { CodeLabel, LabelMap, SlotLabel } from "./label-map";

/**
 * Regenerating from source must not cost the user their own work: entries the
 * compiler wrote are replaced wholesale, everything else stays. Where a kept
 * manual entry sits on a slot the compiler now names, the manual one wins and
 * the collision is reported.
 */

export interface GeneratedLabels {
  slots: SlotLabel[];
  codeLabels: CodeLabel[];
  codeHash: string;
  /** False when the compiler adapter fell back to names without types. */
  typed: boolean;
}

export interface MergeConflict {
  index: number;
  manual: string;
  compiler: string;
}

const fromCompiler = (e: { origin?: string }) => e.origin === "compiler";

export function mergeGenerated(
  existing: LabelMap,
  generated: GeneratedLabels,
  meta: { sourceFile: string; now: Date; network?: string },
): { map: LabelMap; conflicts: MergeConflict[] } {
  const kept = existing.slots.filter((s) => !fromCompiler(s));
  const keptIndexes = new Map(kept.map((s) => [s.index, s]));
  const conflicts: MergeConflict[] = [];

  const fresh = generated.slots.filter((s) => {
    const manual = keptIndexes.get(s.index);
    if (manual) conflicts.push({ index: s.index, manual: manual.name, compiler: s.name });
    return !manual;
  });

  const slots = [...kept, ...fresh].sort((a, b) => a.index - b.index);
  const codeLabels = [...existing.codeLabels.filter((c) => !fromCompiler(c)), ...generated.codeLabels];
  const codeHashes = existing.codeHashes.some((h) => h.hash === generated.codeHash)
    ? existing.codeHashes
    : [...existing.codeHashes, { hash: generated.codeHash, ...(meta.network ? { network: meta.network } : {}) }];

  return {
    map: {
      ...existing,
      slots,
      codeLabels,
      codeHashes,
      source: { file: meta.sourceFile, generatedAt: meta.now.toISOString() },
    },
    conflicts,
  };
}

/**
 * Writes a merge back. Only the four collections a merge changes are
 * replaced; comments inside them go with them, comments anywhere else stay.
 */
export function applyMerge(text: string, merged: LabelMap): string {
  let out = text;
  out = editDocument(out, ["codeHashes"], merged.codeHashes);
  out = editDocument(out, ["source"], merged.source);
  out = editDocument(out, ["slots"], merged.slots);
  out = editDocument(out, ["codeLabels"], merged.codeLabels);
  return out;
}
