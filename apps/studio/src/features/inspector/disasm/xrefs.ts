import type { Disassembly } from "./decode";
import type { Access } from "./opcode-index";

/**
 * Who touches what. For an unknown contract this is how a slot gets its
 * meaning: the instructions that write it, and the API calls next to them.
 */

export interface SlotRef {
  address: number;
  access: Access;
}

export type JumpKind = "jump" | "branch" | "call" | "error";

export interface Xrefs {
  slots: Map<number, SlotRef[]>;
  writesThrough: { address: number; pointer: number }[];
  incoming: Map<number, { from: number; kind: JumpKind }[]>;
  api: Map<string, number[]>;
}

const push = <K, V>(map: Map<K, V[]>, key: K, value: V) => map.set(key, [...(map.get(key) ?? []), value]);

export function buildXrefs(dis: Disassembly): Xrefs {
  const xrefs: Xrefs = { slots: new Map(), writesThrough: [], incoming: new Map(), api: new Map() };
  for (const instr of dis.instructions) {
    const mnemonic = instr.form.mnemonic;
    let pointerNoted = false;
    for (const o of instr.operands) {
      if (o.kind === "slot") {
        push(xrefs.slots, o.index, { address: instr.address, access: o.access });
        if (o.writesThrough && !pointerNoted) {
          xrefs.writesThrough.push({ address: instr.address, pointer: o.index });
          pointerNoted = true;
        }
      } else if (o.kind === "target") {
        const kind: JumpKind = mnemonic === "JSR" ? "call" : mnemonic === "ERR" ? "error" : mnemonic === "JMP" ? "jump" : "branch";
        push(xrefs.incoming, o.address, { from: instr.address, kind });
      } else if (o.kind === "api") {
        push(xrefs.api, o.name, instr.address);
      }
    }
  }
  return xrefs;
}

export function slotUse(xrefs: Xrefs, index: number): { reads: number[]; writes: number[] } {
  const refs = xrefs.slots.get(index) ?? [];
  return {
    reads: refs.filter((r) => r.access !== "write").map((r) => r.address),
    writes: refs.filter((r) => r.access !== "read").map((r) => r.address),
  };
}
