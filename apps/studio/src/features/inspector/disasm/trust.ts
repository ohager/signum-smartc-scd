import type { Origin } from "../model/formats";
import type { LabelMap } from "../model/label-map";
import type { Names } from "./names";

/**
 * How much a name can be believed. Only the compiler, for the exact build
 * this contract runs, can vouch for a name; everything a person wrote —
 * here or in a file someone shared — is a claim, shown as one.
 */

export type Trust = "verified" | "otherBuild" | "claim";

export function trustOf(origin: Origin | undefined, map: LabelMap, codeHash: string): Trust {
  if (origin !== "compiler") return "claim";
  return map.source?.codeHash === codeHash ? "verified" : "otherBuild";
}

/** The trust of a slot name as the listing shows it; null for a generated name like `var_007`. */
export function slotTrust(names: Names, index: number, map: LabelMap | null, codeHash: string): Trust | null {
  const label = names.slotLabel[index];
  return label && map ? trustOf(label.origin, map, codeHash) : null;
}

/** The trust of a code name as the listing shows it; null for a generated name like `lab_01a4`. */
export function targetTrust(names: Names, address: number, map: LabelMap | null, codeHash: string): Trust | null {
  const label = names.codeLabel.get(address);
  return label && map ? trustOf(label.origin, map, codeHash) : null;
}
