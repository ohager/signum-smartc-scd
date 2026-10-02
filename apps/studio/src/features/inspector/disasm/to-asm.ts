import type { Disassembly, InstructionRow, Operand } from "./decode";
import type { Names } from "./names";

/**
 * Assembly the SmartC assembler takes back. Every slot is declared in index
 * order, gaps included, because declaration order is what assigns
 * addresses. The header names where the code came from: it does not stop a
 * clone, but it keeps an honest copy honest, and a clone gets a different
 * code hash than the original anyway.
 */

export interface Provenance {
  contractId: string;
  contractRS: string;
  network: string;
  codeHash: string;
  creatorRS: string;
  date: Date;
  labelsFile: string | null;
}

interface NameLookup {
  slot(index: number): string;
  target(address: number): string;
}

export function operandText(o: Operand, names: NameLookup): string {
  switch (o.kind) {
    case "slot":
      return names.slot(o.index);
    case "const":
      return o.value.toString(16).padStart(16, "0");
    case "target":
      return names.target(o.address);
    case "api":
      return o.name;
  }
}

export function renderInstruction(row: InstructionRow, names: NameLookup): string {
  return row.form.parts.map((p) => (typeof p === "string" ? p : operandText(row.operands[p]!, names))).join("");
}

/** One line, whatever the input: a newline in a name must not become an asm line. */
const oneLine = (text: string) => text.replace(/[\r\n]+/g, " ").trim();

export function toAsm(dis: Disassembly, names: Names, p: Provenance): string {
  if (!dis.assemblable) throw new Error("listing is not assemblable"); // i18n-ignore — callers disable export first
  const lookup: NameLookup = {
    slot: (i) => names.slotAsm[i]!,
    target: (a) => names.targetAsm.get(a)!,
  };
  // i18n-ignore — the header is part of the exported file, not the UI
  const lines = [
    `^comment ${oneLine(`Disassembled from contract ${p.contractId} (${p.contractRS}) on ${p.network}`)}`,
    `^comment ${oneLine(`Code hash ${p.codeHash} · creator ${p.creatorRS} · ${p.date.toISOString()}`)}`,
    `^comment ${oneLine(`Labels: ${p.labelsFile ?? "none"} (manual and imported names are claims, not verified)`)}`,
    ...names.slotAsm.map((name) => `^declare ${name}`),
  ];
  for (const row of dis.instructions) {
    const label = names.targetAsm.get(row.address);
    if (label) lines.push(`${label}:`);
    lines.push(renderInstruction(row, lookup));
  }
  return lines.join("\n") + "\n";
}
