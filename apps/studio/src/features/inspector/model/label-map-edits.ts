import { findNodeAtLocation, parseTree } from "jsonc-parser";
import { editDocument } from "./jsonc";
import {
  isFixedGroup,
  parseLabelMap,
  type CodeHashEntry,
  type LabelMap,
  type MapGroup,
  type SlotLabel,
} from "./label-map";

/**
 * Every change the UI makes to a Label Map. Each one edits only the node it
 * concerns, so a file the user has commented by hand keeps its comments.
 */

function current(text: string): LabelMap {
  const r = parseLabelMap(text);
  if (!r.ok) throw new Error(r.errors[0]?.message ?? "invalid Label Map"); // i18n-ignore — unreachable: a failed parse always has an error
  return r.value;
}

/** Whether the raw text has `key` at top level; defaults fill it only in the parsed value. */
function hasKey(text: string, key: string): boolean {
  const root = parseTree(text, [], { allowTrailingComma: true });
  return !!root && !!findNodeAtLocation(root, [key]);
}

function insertAt(text: string, key: string, position: number, value: unknown): string {
  return hasKey(text, key)
    ? editDocument(text, [key, position], value, { insert: true })
    : editDocument(text, [key], [value]);
}

export function upsertSlot(text: string, slot: SlotLabel): string {
  const entry = { ...slot, origin: slot.origin ?? "manual" };
  const slots = current(text).slots;
  const at = slots.findIndex((s) => s.index === slot.index);
  if (at >= 0) return editDocument(text, ["slots", at], entry);
  const before = slots.findIndex((s) => s.index > slot.index);
  return insertAt(text, "slots", before < 0 ? slots.length : before, entry);
}

export function removeSlot(text: string, index: number): string {
  const at = current(text).slots.findIndex((s) => s.index === index);
  return at < 0 ? text : editDocument(text, ["slots", at], undefined);
}

function sameGroup(a: MapGroup, b: MapGroup): boolean {
  if (isFixedGroup(a) && isFixedGroup(b)) return a.key1 === b.key1;
  if (!isFixedGroup(a) && !isFixedGroup(b)) return a.key1Format === b.key1Format && a.name === b.name;
  return false;
}

export function upsertMapGroup(text: string, group: MapGroup): string {
  const entry = { ...group, origin: group.origin ?? "manual" };
  const maps = current(text).maps;
  const at = maps.findIndex((g) => sameGroup(g, group));
  if (at >= 0) return editDocument(text, ["maps", at], entry);
  return insertAt(text, "maps", maps.length, entry);
}

export function removeMapGroup(text: string, position: number): string {
  return editDocument(text, ["maps", position], undefined);
}

export function addCodeHash(text: string, entry: CodeHashEntry): string {
  const hashes = current(text).codeHashes;
  if (hashes.some((h) => h.hash === entry.hash)) return text;
  return insertAt(text, "codeHashes", hashes.length, entry);
}

export function removeCodeHash(text: string, hash: string): string {
  const at = current(text).codeHashes.findIndex((h) => h.hash === hash);
  return at < 0 ? text : editDocument(text, ["codeHashes", at], undefined);
}

export function setEnum(text: string, name: string, values: Record<string, string>): string {
  current(text);
  return hasKey(text, "enums")
    ? editDocument(text, ["enums", name], values)
    : editDocument(text, ["enums"], { [name]: values });
}

export function removeEnum(text: string, name: string): string {
  current(text);
  return editDocument(text, ["enums", name], undefined);
}
