import { formatValue, slotToBigInt } from "./decode";
import type { LabelMap, SlotLabel } from "./label-map";

/** The data stack as table rows: one per 8-byte slot, plus labels that point past its end. */

export interface SlotRow {
  index: number;
  /** The slot's 16 hex chars as stored; null for a label beyond the data. */
  hex: string | null;
  name: string | null;
  label: SlotLabel | null;
  value: string | null;
  outOfRange: boolean;
}

const SLOT_HEX = 16;

export function slotCount(machineData: string): number {
  return Math.floor(machineData.length / SLOT_HEX);
}

function labelFor(labels: SlotLabel[], index: number): SlotLabel | null {
  return labels.find((l) => index >= l.index && index < l.index + (l.length ?? 1)) ?? null;
}

export function buildSlotRows(machineData: string, map: LabelMap | null, prefix: "S" | "TS"): SlotRow[] {
  const labels = map?.slots ?? [];
  const enums = map?.enums ?? {};
  const count = slotCount(machineData);
  const rows: SlotRow[] = [];

  for (let index = 0; index < count; index++) {
    const hex = machineData.slice(index * SLOT_HEX, (index + 1) * SLOT_HEX);
    const label = labelFor(labels, index);
    const name = label ? ((label.length ?? 1) > 1 ? `${label.name}[${index - label.index}]` : label.name) : null;
    rows.push({
      index,
      hex,
      name,
      label,
      value: formatValue(slotToBigInt(hex), label?.format ?? "long", { prefix, enums, enumName: label?.enum }),
      outOfRange: false,
    });
  }

  for (const label of labels) {
    if (label.index >= count) {
      rows.push({ index: label.index, hex: null, name: label.name, label, value: null, outOfRange: true });
    }
  }
  return rows;
}
