import { Address } from "@signumjs/core";
import type { FormatContext } from "./decode";
import type { ValueFormat } from "./formats";

/**
 * The inverse of `decode.ts`: what a person types into a deploy form, turned
 * into the 64 bits the contract will find in its slot. Every result is an
 * unsigned `bigint`, so the deploy data and the inspector's later reading of
 * that slot go through the same number.
 */

export type EncodeError = "invalid" | "outOfRange" | "tooLong" | "tooManyDecimals" | "unknownEnum";
export type EncodeResult = { ok: true; raw: bigint } | { ok: false; error: EncodeError };

const MIN_SIGNED = -(2n ** 63n);
const MAX_SIGNED = 2n ** 63n - 1n;
const MAX_UNSIGNED = 2n ** 64n - 1n;
const FIXED_DECIMALS = 8;

const ok = (value: bigint): EncodeResult => ({ ok: true, raw: BigInt.asUintN(64, value) });
const fail = (error: EncodeError): EncodeResult => ({ ok: false, error });

const signed = (value: bigint): EncodeResult =>
  value < MIN_SIGNED || value > MAX_SIGNED ? fail("outOfRange") : ok(value);
const unsigned = (value: bigint): EncodeResult =>
  value < 0n || value > MAX_UNSIGNED ? fail("outOfRange") : ok(value);

function fixed(input: string): EncodeResult {
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(input);
  if (!m) return fail("invalid");
  const [, sign, whole, fraction = ""] = m;
  if (fraction.length > FIXED_DECIMALS) return fail("tooManyDecimals");
  // String arithmetic: 0.1 is not a float here, it is ten million units.
  const scaled = BigInt(whole! + fraction.padEnd(FIXED_DECIMALS, "0"));
  return signed(sign ? -scaled : scaled);
}

function text(input: string): EncodeResult {
  const bytes = new TextEncoder().encode(input);
  if (bytes.length > 8) return fail("tooLong");
  let raw = 0n;
  bytes.forEach((b, i) => (raw |= BigInt(b) << BigInt(8 * i)));
  return ok(raw);
}

function address(input: string): EncodeResult {
  if (/^\d+$/.test(input)) return unsigned(BigInt(input));
  try {
    return unsigned(BigInt(Address.fromReedSolomonAddress(input.toUpperCase()).getNumericId()));
  } catch {
    return fail("invalid");
  }
}

function enumValue(input: string, ctx: FormatContext): EncodeResult {
  const entries = ctx.enumName ? ctx.enums[ctx.enumName] ?? {} : {};
  if (input in entries) return signed(BigInt(input));
  const key = Object.entries(entries).find(([, label]) => label === input)?.[0];
  return key === undefined ? fail("unknownEnum") : signed(BigInt(key));
}

export function encodeValue(input: string, format: ValueFormat, ctx: FormatContext): EncodeResult {
  const value = input.trim();
  switch (format) {
    case "long":
      return /^-?\d+$/.test(value) ? signed(BigInt(value)) : fail("invalid");
    case "unsigned":
      return /^\d+$/.test(value) ? unsigned(BigInt(value)) : fail("invalid");
    case "fixed":
      return fixed(value);
    case "hex": {
      const digits = value.replace(/^0x/i, "");
      return /^[0-9a-f]+$/i.test(digits) ? unsigned(BigInt("0x" + digits)) : fail("invalid");
    }
    case "address":
      return address(value);
    case "string":
      return text(input);
    case "bool":
      if (value === "true" || value === "1") return ok(1n);
      if (value === "false" || value === "0") return ok(0n);
      return fail("invalid");
    case "enum":
      return enumValue(value, ctx);
  }
}

/** `ContractData` for `generateDataStack`: always the unsigned decimal. */
export function toContractData(raw: bigint): string {
  return BigInt.asUintN(64, raw).toString();
}
