import { APIS_BY_OPCODE, FORMS, type FormSpec } from "./opcode-index";

/** Seeded PRNG so a failing fuzz case reproduces. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const le = (value: number, width: number) => {
  let out = "";
  for (let i = 0; i < width; i++) out += ((value >>> (8 * i)) & 0xff).toString(16).padStart(2, "0");
  return out;
};

/**
 * A random but valid program: every form the decoder knows, small slots,
 * real API functions for their own form, and jump/branch targets that land
 * on instruction starts (branches within their signed-byte reach).
 */
export function randomProgram(rand: () => number, count: number): string {
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const usable = FORMS.filter((f) => !f.operands.some((o) => o.type === "F") || APIS_BY_OPCODE.has(f.opCode));
  const forms: FormSpec[] = Array.from({ length: count }, () => pick(usable));
  const starts: number[] = [];
  let at = 0;
  for (const f of forms) {
    starts.push(at);
    at += f.size;
  }
  return forms
    .map((f, k) => {
      const self = starts[k]!;
      let bytes = f.opCode.toString(16).padStart(2, "0");
      for (const o of f.operands) {
        if (o.type === "I") bytes += le(Math.floor(rand() * 12), 4);
        if (o.type === "L") bytes += le(Math.floor(rand() * 2 ** 32), 4) + le(Math.floor(rand() * 2 ** 32), 4);
        if (o.type === "J") bytes += le(pick(starts), 4);
        if (o.type === "B") {
          const reach = starts.filter((s) => s - self >= -128 && s - self <= 127);
          bytes += le((pick(reach) - self) & 0xff, 1);
        }
        if (o.type === "F") bytes += le(pick(APIS_BY_OPCODE.get(f.opCode)!).code, 2);
      }
      return bytes;
    })
    .join("");
}
