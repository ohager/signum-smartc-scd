import { Amount } from "@signumjs/util";

/**
 * A SIGNA amount typed into a number field, as planck — or `null`.
 *
 * `type="number"` lets through `1e5` and `-1`; `Amount.fromSigna` throws on
 * the first, and a render that throws takes the whole page down. Neither is
 * an amount anyone means to send.
 */
export function signaToPlanck(input: string): string | null {
  const value = input.trim();
  if (!/^\d+(\.\d{1,8})?$/.test(value)) return null;
  return Amount.fromSigna(value).getPlanck();
}
