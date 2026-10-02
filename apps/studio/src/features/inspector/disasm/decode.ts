import { API_BY_CODE, FORM_BY_OPCODE, type Access, type FormSpec } from "./opcode-index";

/**
 * AT bytecode → rows, one linear sweep from address 0. Nothing here throws:
 * a byte that is not an instruction becomes an `unknown` row and decoding
 * resumes at the next byte, because a half-readable listing is worth more
 * to someone investigating a contract than an error.
 *
 * Code is stored padded to whole pages with `00`. `00` is not an opcode, so
 * padding starts at the first instruction boundary after which only zeros
 * follow; zeros inside the last instruction's operands stay its operands.
 */

export type Operand =
  | { kind: "slot"; index: number; access: Access; writesThrough: boolean }
  | { kind: "const"; value: bigint }
  | { kind: "target"; address: number; relative: boolean }
  | { kind: "api"; code: number; name: string };

export type InstructionRow = {
  kind: "instruction";
  address: number;
  size: number;
  bytes: string;
  form: FormSpec;
  operands: Operand[];
};

export type Row =
  | InstructionRow
  | { kind: "unknown"; address: number; size: 1; bytes: string; reason: "opcode" | "api" | "slot" | "truncated" }
  | { kind: "padding"; address: number; size: number };

export interface Disassembly {
  rows: Row[];
  instructions: InstructionRow[];
  /** Bytes before the page padding. */
  codeLength: number;
  /** Addresses of instructions whose target is not an instruction start. */
  misaligned: number[];
  assemblable: boolean;
}

/**
 * Slot indices above this are treated as garbage, not as a request to declare
 * them all: every cell up to the highest is declared, and 65,536 declarations
 * keep the assembler busy for over a minute. 8,192 cells (64 KB of data) is far
 * beyond any real contract.
 */
export const MAX_SLOT = 0x1fff;

function byteAt(hex: string, at: number): number {
  return parseInt(hex.slice(at * 2, at * 2 + 2), 16);
}

function readU(hex: string, at: number, width: number): number {
  let value = 0;
  for (let i = width - 1; i >= 0; i--) value = value * 256 + byteAt(hex, at + i);
  return value;
}

function readU64(hex: string, at: number): bigint {
  let value = 0n;
  for (let i = 7; i >= 0; i--) value = (value << 8n) | BigInt(byteAt(hex, at + i));
  return value;
}

export function decode(input: string): Disassembly {
  const raw = input.trim().toLowerCase();
  const hex = /^[0-9a-f]*$/.test(raw) && raw.length % 2 === 0 ? raw : "";
  const total = hex.length / 2;
  const rows: Row[] = [];
  const unknown = (at: number, reason: "opcode" | "api" | "slot" | "truncated") =>
    rows.push({ kind: "unknown", address: at, size: 1, bytes: hex.slice(at * 2, at * 2 + 2), reason });

  let at = 0;
  while (at < total) {
    if (/^0*$/.test(hex.slice(at * 2))) {
      rows.push({ kind: "padding", address: at, size: total - at });
      break;
    }
    const form = FORM_BY_OPCODE.get(byteAt(hex, at));
    if (!form) {
      unknown(at, "opcode");
      at++;
      continue;
    }
    if (at + form.size > total) {
      unknown(at, "truncated");
      at++;
      continue;
    }

    let p = at + 1;
    let bad: "api" | "slot" | null = null;
    const operands: Operand[] = form.operands.map((spec) => {
      switch (spec.type) {
        case "I": {
          const index = readU(hex, p, 4);
          p += 4;
          if (index > MAX_SLOT) bad = "slot";
          return { kind: "slot", index, access: spec.access!, writesThrough: !!spec.writesThrough };
        }
        case "L": {
          const value = readU64(hex, p);
          p += 8;
          return { kind: "const", value };
        }
        case "J": {
          const address = readU(hex, p, 4);
          p += 4;
          return { kind: "target", address, relative: false };
        }
        case "B": {
          const offset = byteAt(hex, p);
          p += 1;
          return { kind: "target", address: at + (offset > 127 ? offset - 256 : offset), relative: true };
        }
        case "F": {
          const code = readU(hex, p, 2);
          p += 2;
          const api = API_BY_CODE.get(code);
          // An API function only exists in its own form: get_A1 as 0x33 is not assemblable.
          if (!api || api.opCode !== form.opCode) bad = "api";
          return { kind: "api", code, name: api?.name ?? "" };
        }
      }
    });
    if (bad) {
      unknown(at, bad);
      at++;
      continue;
    }
    rows.push({ kind: "instruction", address: at, size: form.size, bytes: hex.slice(at * 2, (at + form.size) * 2), form, operands });
    at += form.size;
  }

  const instructions = rows.filter((r): r is InstructionRow => r.kind === "instruction");
  const starts = new Set(instructions.map((i) => i.address));
  const misaligned = instructions
    .filter((i) => i.operands.some((o) => o.kind === "target" && !starts.has(o.address)))
    .map((i) => i.address);
  const padding = rows.find((r) => r.kind === "padding");

  return {
    rows,
    instructions,
    codeLength: padding ? padding.address : total,
    misaligned,
    assemblable: !rows.some((r) => r.kind === "unknown") && misaligned.length === 0,
  };
}
