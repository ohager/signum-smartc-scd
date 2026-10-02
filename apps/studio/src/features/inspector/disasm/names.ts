import type { CodeLabel, LabelMap, SlotLabel } from "../model/label-map";
import type { Disassembly } from "./decode";

/**
 * Two names for everything: what the user reads (the Label Map's own text,
 * `prices[1]`, `helper`) and what the assembler accepts (`\w+`, unique).
 * Display names never reach the `.asm`; asm names never replace what the
 * user wrote.
 */

export interface Names {
  slotCount: number;
  slotAsm: string[];
  slotDisplay: (string | null)[];
  slotLabel: (SlotLabel | null)[];
  targetAsm: Map<number, string>;
  targetDisplay: Map<number, string>;
  codeLabel: Map<number, CodeLabel>;
}

export function sanitize(name: string): string {
  const cleaned = name.replace(/[^A-Za-z0-9_]/g, "_");
  if (!cleaned) return "_";
  return /^[0-9]/.test(cleaned) ? `_${cleaned}` : cleaned;
}

export function displayCodeName(asm: string): string {
  return asm.startsWith("__fn_") ? asm.slice(5) : asm;
}

function unique(base: string, used: Set<string>): string {
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}_${n}`;
  used.add(name);
  return name;
}

export function buildNames(dis: Disassembly | null, map: LabelMap | null, dataSlots: number): Names {
  const labels = map?.slots ?? [];
  let highest = dataSlots - 1;
  for (const i of dis?.instructions ?? []) {
    for (const o of i.operands) if (o.kind === "slot") highest = Math.max(highest, o.index);
  }
  // Labels name slots; they do not create them. A label far beyond the code
  // and data (a typo, or a map shared for another build) would otherwise
  // declare tens of thousands of cells and stall the assembler.
  const slotCount = highest + 1;
  const width = Math.max(3, String(Math.max(0, slotCount - 1)).length);

  const used = new Set<string>();
  const slotAsm: string[] = [];
  const slotDisplay: (string | null)[] = [];
  const slotLabel: (SlotLabel | null)[] = [];
  for (let index = 0; index < slotCount; index++) {
    const label = labels.find((l) => index >= l.index && index < l.index + (l.length ?? 1)) ?? null;
    const isArray = !!label && (label.length ?? 1) > 1;
    const offset = label ? index - label.index : 0;
    slotLabel.push(label);
    slotDisplay.push(label ? (isArray ? `${label.name}[${offset}]` : label.name) : null);
    const base = label ? sanitize(isArray ? `${label.name}_${offset}` : label.name) : `var_${String(index).padStart(width, "0")}`;
    slotAsm.push(unique(base, used));
  }

  // Compiler entries first, so a name a person gave the same address wins.
  const codeLabels = [...(map?.codeLabels ?? [])].sort((a, b) => Number(a.origin !== "compiler") - Number(b.origin !== "compiler"));
  const codeLabel = new Map(codeLabels.map((c) => [c.address, c]));
  const targets = new Set<number>(codeLabel.keys());
  for (const i of dis?.instructions ?? []) {
    for (const o of i.operands) if (o.kind === "target") targets.add(o.address);
  }
  const targetAsm = new Map<number, string>();
  const targetDisplay = new Map<number, string>();
  for (const address of [...targets].sort((a, b) => a - b)) {
    const label = codeLabel.get(address);
    const asm = unique(label ? sanitize(label.name) : `lab_${address.toString(16).padStart(4, "0")}`, used);
    targetAsm.set(address, asm);
    targetDisplay.set(address, label ? displayCodeName(label.name) : asm);
  }

  return { slotCount, slotAsm, slotDisplay, slotLabel, targetAsm, targetDisplay, codeLabel };
}
