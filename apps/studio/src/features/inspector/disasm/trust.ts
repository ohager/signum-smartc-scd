import type { Origin } from "../model/formats";
import type { LabelMap } from "../model/label-map";

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
