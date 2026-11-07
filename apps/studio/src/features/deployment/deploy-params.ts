import type { LabelMap, SlotLabel } from "@/features/inspector/model/label-map";
import { decimalToBigInt, slotToBigInt, type FormatContext } from "@/features/inspector/model/decode";
import { encodeValue, toContractData, type EncodeError } from "@/features/inspector/model/encode";

/**
 * What a deployment writes into the new contract's memory.
 *
 * The data is contiguous from slot 0, so setting one parameter means sending
 * every slot below it. Those slots are not free to be zero: the compiler
 * keeps its constants (`f100000000`), array pointers and `const` assignments
 * in the initial memory (`ByteData`), not in code. That memory is the base;
 * parameters are laid over it.
 */

export interface FieldState {
  slot: SlotLabel;
  raw: bigint;
  error?: EncodeError;
}

export type RowKind = "param" | "internal" | "filler";

export interface PreviewRow {
  index: number;
  name?: string;
  raw: bigint;
  kind: RowKind;
}

export interface DataStackResult {
  fields: FieldState[];
  rows: PreviewRow[];
  /** `ContractData` for the deployment; `null` while something is invalid. */
  data: string[] | null;
  tooLarge: boolean;
}

const ARRAY_POINTER = "array pointer"; // i18n-ignore — the generator's marker comment
const INTERNAL = [/^r\d+$/, /^[fn]\d+$/];

/**
 * The parameters of a contract. A Label Map entry someone wrote wins over the
 * generator, slot by slot; a stored compiler entry does not — it is an older
 * copy of what the generator says now, the same rule regeneration follows.
 */
export function paramSlots(generated: SlotLabel[] | null, map: LabelMap | null): SlotLabel[] {
  const byIndex = new Map<number, SlotLabel>();
  const fresh = new Set<number>();
  for (const slot of generated ?? []) {
    if (slot.length !== undefined) continue;
    byIndex.set(slot.index, slot);
    fresh.add(slot.index);
  }
  for (const slot of map?.slots ?? []) {
    if (slot.length !== undefined) continue;
    if (slot.origin === "compiler" && fresh.has(slot.index)) continue;
    byIndex.set(slot.index, slot);
  }
  // The Label Map cannot tell a pointer from a value; the compiler can.
  const pointers = new Set((generated ?? []).filter((s) => s.comment === ARRAY_POINTER).map((s) => s.index));
  return [...byIndex.values()]
    .filter((s) => s.param === true && (s.length ?? 1) === 1 && !pointers.has(s.index))
    .sort((a, b) => a.index - b.index);
}

/** The compiler's initial memory, one value per slot, without trailing zeros. */
export function baseFromByteData(hex: string): bigint[] {
  const slots = (hex.match(/.{16}/g) ?? []).map(slotToBigInt);
  while (slots.length > 0 && slots[slots.length - 1] === 0n) slots.pop();
  return slots;
}

export function buildDataStack(args: {
  params: SlotLabel[];
  values: Record<number, string>;
  ctx: Omit<FormatContext, "enumName">;
  capacity: number;
  base?: bigint[];
  memory?: string[];
  labels?: SlotLabel[];
}): DataStackResult {
  const { params, values, ctx, capacity, base = [], memory = [], labels = [] } = args;

  const fields: FieldState[] = params.map((slot) => {
    const input = values[slot.index]?.trim() ?? "";
    if (input === "") {
      const raw = slot.default !== undefined ? decimalToBigInt(slot.default) : base[slot.index] ?? 0n;
      return { slot, raw };
    }
    const r = encodeValue(input, slot.format ?? "long", { ...ctx, enumName: slot.enum });
    return r.ok ? { slot, raw: r.raw } : { slot, raw: 0n, error: r.error };
  });

  let lastBase = base.length - 1;
  while (lastBase >= 0 && base[lastBase] === 0n) lastBase--;
  const highestParam = params.reduce((max, s) => Math.max(max, s.index), -1);
  const length = Math.max(highestParam, lastBase) + 1;

  const byIndex = new Map(fields.map((f) => [f.slot.index, f]));
  const names = new Map(labels.map((l) => [l.index, l.name]));
  const rows: PreviewRow[] = [];
  for (let index = 0; index < length; index++) {
    const field = byIndex.get(index);
    if (field) {
      rows.push({ index, name: field.slot.name, raw: field.raw, kind: "param" });
      continue;
    }
    const memoryName = memory[index];
    const internal = memoryName !== undefined && INTERNAL.some((re) => re.test(memoryName));
    rows.push({ index, name: names.get(index) ?? memoryName, raw: base[index] ?? 0n, kind: internal ? "internal" : "filler" });
  }

  const tooLarge = length > capacity;
  const invalid = fields.some((f) => f.error);
  return { fields, rows, data: tooLarge || invalid ? null : rows.map((r) => toContractData(r.raw)), tooLarge };
}
