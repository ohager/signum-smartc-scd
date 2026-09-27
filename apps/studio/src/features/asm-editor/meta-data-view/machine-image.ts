import type { MachineData } from "@/features/asm-editor/machine-data.ts";

/**
 * The arithmetic the assembler does, repeated here so the panel can show it.
 *
 * A page is 256 bytes, a data page holds 32 eight-byte slots, and the minimum
 * fee is 0.1 SIGNA for every page of every kind — which is why the panel shows
 * pages at all: they are the unit the chain charges in.
 */
export const PAGE_BYTES = 256;
export const SLOTS_PER_DATA_PAGE = 32;

export interface PageKind {
  label: string;
  count: number;
  /** How full the last page of this kind is, 0–1. */
  lastFill: number;
}

function fillOfLastPage(used: number, perPage: number) {
  if (used === 0) return 0;
  const remainder = used % perPage;
  return remainder === 0 ? 1 : remainder / perPage;
}

export function pageBudget(data: MachineData): PageKind[] {
  return [
    {
      label: "code",
      count: data.CodePages,
      lastFill: fillOfLastPage(data.ByteCode.length / 2, PAGE_BYTES),
    },
    {
      label: "data",
      count: data.DataPages,
      lastFill: fillOfLastPage(data.Memory.length, SLOTS_PER_DATA_PAGE),
    },
    { label: "code stack", count: data.CodeStackPages, lastFill: 1 },
    { label: "user stack", count: data.UserStackPages, lastFill: 1 },
  ];
}

const SLOT_HEX_DIGITS = 16;

/**
 * The starting value of one memory slot.
 *
 * `ByteData` is the initial memory image: one 8-byte little-endian long per
 * slot, and the assembler stops writing it after the last slot that holds
 * something. A short read therefore means zero, not missing data.
 */
export function initialValue(byteData: string, slot: number): bigint {
  const hex = byteData.slice(
    slot * SLOT_HEX_DIGITS,
    (slot + 1) * SLOT_HEX_DIGITS,
  );
  if (hex.length < SLOT_HEX_DIGITS) return 0n;

  let value = 0n;
  for (let at = SLOT_HEX_DIGITS - 2; at >= 0; at -= 2) {
    value = (value << 8n) | BigInt(parseInt(hex.slice(at, at + 2), 16));
  }
  return value;
}

/** Four digits covers 64 KiB; an AT that outgrew it could not be deployed. */
export const OFFSET_DIGITS = 4;
export const BYTE_GROUP = 8;
const MAX_PER_ROW = 64;

/** offset + gap + "xx " per byte + one extra space between groups. */
export function rowColumns(bytes: number) {
  return OFFSET_DIGITS + 2 + bytes * 3 - 1 + (bytes / BYTE_GROUP - 1);
}

/**
 * The longest whole-group row that fits in the given character width.
 *
 * A dump with a fixed row length is what made this view feel cramped: at a
 * fixed sixteen it either wrapped mid-row — which destroys the column
 * alignment a dump exists for — or left half the panel empty.
 */
export function largestRowFitting(columns: number) {
  for (let bytes = MAX_PER_ROW; bytes > BYTE_GROUP; bytes -= BYTE_GROUP) {
    if (rowColumns(bytes) <= columns) return bytes;
  }
  return BYTE_GROUP;
}
