import { z } from "zod";
import { parseDocument, type Parsed } from "../model/jsonc";
import { parseLabelMap, type LabelMap } from "../model/label-map";
import { upsertCodeLabel, upsertSlot } from "../model/label-map-edits";
import { buildNames } from "./names";

/**
 * The name map of Signum D'Or — which is also the shape of the SmartC
 * compiler's own machine object: slot names in address order, and code
 * labels with addresses. Imported names are claims, and they never replace
 * a name the Label Map already has.
 */

export const DorMapSchema = z.object({
  Memory: z.array(z.string()),
  Labels: z.array(z.object({ label: z.string(), address: z.int().nonnegative() })).default([]),
});
export type DorMap = z.infer<typeof DorMapSchema>;

/** Names D'Or and the compiler generate on their own; importing them would only add noise. */
const GENERATED = /^(r\d+|var_?\d+|lab_[0-9a-f]+)$/;

export function toDorMap(map: LabelMap): DorMap {
  // Without code, the declared slots are exactly the labelled ones.
  const end = map.slots.reduce((max, s) => Math.max(max, s.index + (s.length ?? 1)), 0);
  const names = buildNames(null, map, end);
  return {
    Memory: names.slotAsm,
    Labels: map.codeLabels.map((c) => ({ label: names.targetAsm.get(c.address)!, address: c.address })),
  };
}

export function parseDorMap(text: string): Parsed<DorMap> {
  return parseDocument(text, DorMapSchema);
}

export function importDorMap(labelMapText: string, dor: DorMap): { text: string; added: number } {
  const current = parseLabelMap(labelMapText);
  if (!current.ok) throw new Error(current.errors[0]?.message ?? "invalid Label Map"); // i18n-ignore — unreachable: a failed parse always has an error
  // An array label covers every slot of its length, not just its first index.
  const taken = new Set(current.value.slots.flatMap((s) => Array.from({ length: s.length ?? 1 }, (_, k) => s.index + k)));
  const takenLabels = new Set(current.value.codeLabels.map((c) => c.address));
  let text = labelMapText;
  let added = 0;
  dor.Memory.forEach((name, index) => {
    if (GENERATED.test(name) || taken.has(index)) return;
    text = upsertSlot(text, { index, name, origin: "imported" });
    added++;
  });
  for (const l of dor.Labels) {
    if (GENERATED.test(l.label) || takenLabels.has(l.address)) continue;
    text = upsertCodeLabel(text, { address: l.address, name: l.label, origin: "imported" });
    added++;
  }
  return { text, added };
}
