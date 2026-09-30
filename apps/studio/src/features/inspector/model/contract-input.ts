import { Address } from "@signumjs/core";

/** A contract as the user types it — numeric id or `S-…`/`TS-…` address — as the numeric id the API wants. */
export function parseContractId(input: string): string | null {
  const value = input.trim();
  if (!value) return null;
  if (/^\d+$/.test(value)) return value;
  try {
    return Address.create(value).getNumericId();
  } catch {
    return null;
  }
}
