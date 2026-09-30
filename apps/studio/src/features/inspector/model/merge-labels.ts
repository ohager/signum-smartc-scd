import { editDocument } from "./jsonc";
import { parseLabelMap } from "./label-map";
import { addCodeHash, appendCodeLabel, upsertSlot } from "./label-map-edits";
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
 * Writes a merge back as single-node edits: compiler entries out, new
 * compiler entries in, a hash only if it is missing, `source` in place.
 * Replacing the collections wholesale would be shorter and would delete every
 * comment the user wrote beside a hash or above a manual slot — on every
 * "Inspect" after a deploy.
 */
export function applyMerge(text: string, merged: LabelMap): string {
  const current = (t: string): LabelMap => {
    const r = parseLabelMap(t);
    if (!r.ok) throw new Error(r.errors[0]?.message ?? "invalid Label Map"); // i18n-ignore — unreachable: a failed parse always has an error
    return r.value;
  };
  let out = text;

  // An entry the compiler still produces is replaced where it stands; only
  // entries it no longer produces are removed, back to front so the positions
  // still to visit stay valid. Removing and re-inserting everything would also
  // take the comments between the entries with it.
  const freshSlots = new Map(merged.slots.filter(fromCompiler).map((s) => [s.index, s]));
  const slots = current(out).slots;
  for (let i = slots.length - 1; i >= 0; i--) {
    const slot = slots[i]!;
    if (!fromCompiler(slot)) continue;
    const fresh = freshSlots.get(slot.index);
    out = editDocument(out, ["slots", i], fresh);
    freshSlots.delete(slot.index);
  }
  for (const slot of freshSlots.values()) out = upsertSlot(out, slot);

  const freshLabels = new Map(merged.codeLabels.filter(fromCompiler).map((c) => [c.address, c]));
  const labels = current(out).codeLabels;
  for (let i = labels.length - 1; i >= 0; i--) {
    const label = labels[i]!;
    if (!fromCompiler(label)) continue;
    out = editDocument(out, ["codeLabels", i], freshLabels.get(label.address));
    freshLabels.delete(label.address);
  }
  for (const label of freshLabels.values()) out = appendCodeLabel(out, label);

  for (const hash of merged.codeHashes) out = addCodeHash(out, hash);
  return editDocument(out, ["source"], merged.source);
}
