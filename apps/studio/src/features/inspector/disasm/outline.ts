import type { Disassembly } from "./decode";
import { BRANCH_MNEMONICS } from "./opcode-index";

/**
 * Where a reader starts. Entry points are unambiguous in AT code — address 0,
 * the instruction after `PCS` (where every later run resumes), `ERR` targets
 * and `JSR` targets — and sections run from one entry to the next. SmartC
 * lays functions out contiguously, so for its code a section is a C
 * function; for hand-made or SmartJ code it is a reading aid, nothing more.
 */

export type EntryKind = "start" | "restart" | "error" | "function";

export interface Section {
  address: number;
  /** Exclusive. */
  end: number;
  kinds: EntryKind[];
  /** Addresses of the `JSR`s that call this section. */
  callers: number[];
}

export interface Outline {
  sections: Section[];
  blockStarts: Set<number>;
}

const ENDS_BLOCK = new Set(["JMP", "RET", "FIN", "STP", ...BRANCH_MNEMONICS]); // i18n-ignore

export function buildOutline(dis: Disassembly): Outline {
  const instructions = dis.instructions;
  const starts = new Set(instructions.map((i) => i.address));
  const entries = new Map<number, { kinds: Set<EntryKind>; callers: number[] }>();
  const add = (address: number, kind: EntryKind) => {
    if (!starts.has(address)) return null;
    const entry = entries.get(address) ?? { kinds: new Set<EntryKind>(), callers: [] };
    entry.kinds.add(kind);
    entries.set(address, entry);
    return entry;
  };

  add(0, "start");
  const blockStarts = new Set<number>(starts.has(0) ? [0] : []);
  instructions.forEach((instr, k) => {
    const next = instructions[k + 1];
    const target = instr.operands.find((o) => o.kind === "target");
    const mnemonic = instr.form.mnemonic;
    if (mnemonic === "PCS" && next) add(next.address, "restart");
    if (target?.kind === "target") {
      if (mnemonic === "ERR") add(target.address, "error");
      if (mnemonic === "JSR") add(target.address, "function")?.callers.push(instr.address);
      if (starts.has(target.address)) blockStarts.add(target.address);
    }
    if (ENDS_BLOCK.has(mnemonic) && next) blockStarts.add(next.address);
  });

  const sorted = [...entries.entries()].sort(([a], [b]) => a - b);
  const sections = sorted.map(([address, entry], k) => ({
    address,
    end: sorted[k + 1]?.[0] ?? dis.codeLength,
    kinds: [...entry.kinds],
    callers: entry.callers,
  }));
  return { sections, blockStarts };
}
