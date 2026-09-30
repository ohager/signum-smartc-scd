import { Address } from "@signumjs/core";
import type { ValueFormat } from "./formats";

/**
 * One 64-bit value, many readings. Everything is carried as an unsigned
 * `bigint` so a slot (little-endian hex) and a map value (signed decimal from
 * the API) end up as the same number before they are formatted.
 */

export interface FormatContext {
  prefix: "S" | "TS";
  enums: Record<string, Record<string, string>>;
  enumName?: string;
}

const U64 = 64;
const FIXED_SCALE = 100_000_000n;

export function slotToBigInt(hex16: string): bigint {
  let bigEndian = "";
  for (let i = 14; i >= 0; i -= 2) bigEndian += hex16.slice(i, i + 2);
  return BigInt("0x" + (bigEndian || "0"));
}

export function decimalToBigInt(decimal: string): bigint {
  return BigInt.asUintN(U64, BigInt(decimal));
}

function bytesLE(raw: bigint): number[] {
  const bytes: number[] = [];
  for (let i = 0; i < 8; i++) bytes.push(Number((raw >> BigInt(8 * i)) & 0xffn));
  return bytes;
}

function bytesToText(bytes: number[]): string {
  let end = bytes.length;
  while (end > 0 && bytes[end - 1] === 0) end--;
  const text = new TextDecoder("utf-8", { fatal: false }).decode(new Uint8Array(bytes.slice(0, end)));
  // eslint-disable-next-line no-control-regex
  return text.replace(/[\u0000-\u001f\u007f]/g, "·");
}

function fixed(signed: bigint): string {
  const negative = signed < 0n;
  const abs = negative ? -signed : signed;
  const fraction = (abs % FIXED_SCALE).toString().padStart(8, "0").replace(/0+$/, "");
  return (negative ? "-" : "") + (abs / FIXED_SCALE).toString() + (fraction ? "." + fraction : "");
}

export function formatValue(raw: bigint, format: ValueFormat, ctx: FormatContext): string {
  const signed = BigInt.asIntN(U64, raw);
  switch (format) {
    case "long":
      return signed.toString();
    case "unsigned":
      return raw.toString();
    case "fixed":
      return fixed(signed);
    case "hex":
      return "0x" + raw.toString(16).padStart(16, "0");
    case "address":
      return raw === 0n ? "0" : Address.fromNumericId(raw.toString(), ctx.prefix).getReedSolomonAddress();
    case "string":
      return bytesToText(bytesLE(raw));
    case "bool":
      return raw === 0n ? "false" : "true";
    case "enum": {
      const label = ctx.enumName ? ctx.enums[ctx.enumName]?.[signed.toString()] : undefined;
      return `${label ?? "?"} (${signed})`;
    }
  }
}

export type Interpretation = { kind: ValueFormat | "stringReversed"; value: string };

export function allInterpretations(raw: bigint, prefix: "S" | "TS"): Interpretation[] {
  const ctx: FormatContext = { prefix, enums: {} };
  const kinds: ValueFormat[] = ["long", "unsigned", "fixed", "hex", "address", "string"];
  return [
    ...kinds.map((kind) => ({ kind, value: formatValue(raw, kind, ctx) })),
    { kind: "stringReversed" as const, value: bytesToText(bytesLE(raw).reverse()) },
    { kind: "bool" as const, value: formatValue(raw, "bool", ctx) },
  ];
}
