import { Address } from "@signumjs/core";
import { decimalToBigInt, formatValue, type FormatContext } from "./decode";
import type { ValueFormat } from "./formats";
import type { MapGroup } from "./label-map";

/**
 * Map keys are signed 64-bit decimals on the wire. A user thinking "the entry
 * for account S-XXXX" should be able to type the address.
 */
export function parseKeyInput(
  input: string,
  format: ValueFormat | undefined,
): { ok: true; key: string } | { ok: false } {
  const value = input.trim();
  if (/^-?\d+$/.test(value)) return { ok: true, key: BigInt.asIntN(64, BigInt(value)).toString() };
  if (format === "address") {
    try {
      const id = Address.create(value).getNumericId();
      return { ok: true, key: BigInt.asIntN(64, BigInt(id)).toString() };
    } catch {
      return { ok: false };
    }
  }
  return { ok: false };
}

export function formatKey2(
  key2: string,
  group: MapGroup | null,
  ctx: FormatContext,
): { name: string | null; key: string; valueFormat?: ValueFormat; enumName?: string } {
  const named = group?.key2?.find((k) => BigInt(k.key2) === BigInt(key2));
  if (named) return { name: named.name, key: key2, valueFormat: named.valueFormat, enumName: named.enum };
  if (group?.key2Format) return { name: null, key: formatValue(decimalToBigInt(key2), group.key2Format, ctx) };
  return { name: null, key: key2 };
}
