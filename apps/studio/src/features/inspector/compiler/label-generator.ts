import { SmartC } from "smartc-signum-compiler";
import { parseCompileError, type ParsedError } from "@/features/smartc-editor/language/compiler-symbols";
import type { CodeLabel, SlotLabel } from "../model/label-map";
import type { GeneratedLabels } from "../model/merge-labels";
import type { ValueFormat } from "../model/formats";

/**
 * Turns SmartC source into Label Map entries.
 *
 * The public `getMachineCode().Memory` is only names in slot order. The types
 * that make a data stack readable — fixed vs long, arrays, struct members,
 * function scopes — live in the compiler's private `Program.memory`. It is
 * read behind this one function; if a compiler update moves it, generation
 * falls back to names and says so (`typed: false`) instead of failing.
 */

export interface MemorySlotLike {
  name: string;
  asmName: string;
  type: string;
  declaration: string;
  address: number;
  scope: string;
}

const REGISTER = /^r\d+$/;
/** Compiler-emitted constants such as `f100000000` or `n32`. */
const CONSTANT = /^[fn]\d+$/;

function formatOf(declaration: string): ValueFormat {
  if (declaration === "fixed") return "fixed";
  if (declaration === "long") return "long";
  return "unsigned"; // pointers: long_ptr, struct_ptr, void_ptr, …
}

function isMemorySlotTable(value: unknown): value is MemorySlotLike[] {
  return (
    Array.isArray(value) &&
    value.every((m) => m && typeof m.asmName === "string" && typeof m.address === "number")
  );
}

export function slotsFromMemoryTable(memory: MemorySlotLike[]): SlotLabel[] {
  const structPrefixes = memory
    .filter((m) => m.type === "struct" && m.address === -1)
    .map((m) => ({ prefix: `${m.asmName}_`, name: m.scope ? `${m.scope}.${m.name}` : m.name }));

  const slots: SlotLabel[] = [];
  for (let i = 0; i < memory.length; i++) {
    const m = memory[i]!;
    if (m.address < 0 || m.type === "register" || REGISTER.test(m.asmName)) continue;
    if (m.name === m.asmName && !m.scope && CONSTANT.test(m.asmName)) continue;

    let name = m.scope ? `${m.scope}.${m.name}` : m.name;
    const struct = structPrefixes.find((s) => m.asmName.startsWith(s.prefix));
    if (struct) name = `${struct.name}.${m.asmName.slice(struct.prefix.length)}`;

    if (m.type === "array") {
      slots.push({ index: m.address, name, format: "unsigned", comment: "array pointer", origin: "compiler" }); // i18n-ignore
      const item = new RegExp(`^${m.asmName}_\\d+$`);
      let length = 0;
      while (memory[i + 1 + length] && item.test(memory[i + 1 + length]!.asmName)) length++;
      if (length > 0) {
        const first = memory[i + 1]!;
        slots.push({ index: first.address, name, format: formatOf(first.declaration), length, origin: "compiler" });
      }
      i += length;
      continue;
    }

    slots.push({ index: m.address, name, format: formatOf(m.declaration), origin: "compiler" });
  }
  return slots;
}

export function slotsFromNames(names: string[]): SlotLabel[] {
  return names
    .map((name, index) => ({ index, name, origin: "compiler" as const }))
    .filter((s) => !REGISTER.test(s.name));
}

/**
 * Variables the `signum-smartc` convention marks as deploy-time values:
 * `const <name> = TESTBED_<x>;` inside `#ifdef TESTBED`. The testbed sets them
 * at deploy, so on chain they are exactly the slots a deployer fills.
 */
export function testbedParams(source: string): Set<string> {
  const names = new Set<string>();
  let inTestbed = false;
  for (const raw of source.split("\n")) {
    const line = raw.replace(/\/\/.*$/, "");
    const directive = /^\s*#\s*(ifdef|ifndef|else|endif)\b\s*(\w*)/.exec(line);
    if (directive) {
      if (directive[1] === "ifdef") inTestbed = directive[2] === "TESTBED";
      else inTestbed = false;
      continue;
    }
    if (!inTestbed) continue;
    const m = /^\s*const\s+(\w+)\s*=\s*TESTBED_\w+\s*;/.exec(line);
    if (m) names.add(m[1]!);
  }
  return names;
}

/** Ids are longs to the compiler; names say when one is an account or contract. */
export function suggestFormat(name: string, compilerFormat: ValueFormat | undefined): ValueFormat | undefined {
  if (compilerFormat !== "long") return compilerFormat;
  return /^(owner|admin|creator)$/i.test(name) || /(Account|Address|Id)$/.test(name) ? "address" : compilerFormat;
}

function withSuggestions(slots: SlotLabel[], params: Set<string>): SlotLabel[] {
  return slots.map((slot) => {
    const format = suggestFormat(slot.name, slot.format);
    const single = !slot.name.includes(".") && slot.length === undefined && slot.comment !== "array pointer"; // i18n-ignore
    return {
      ...slot,
      ...(format ? { format } : {}),
      ...(single && params.has(slot.name) ? { param: true } : {}),
    };
  });
}

export function generateLabels(
  source: string,
): { ok: true; labels: GeneratedLabels } | { ok: false; error: ParsedError } {
  try {
    const compiler = new SmartC({ language: "C", sourceCode: source });
    compiler.compile();
    const mc = compiler.getMachineCode();
    const table = (compiler as unknown as { Program?: { memory?: unknown } }).Program?.memory;
    const typed = isMemorySlotTable(table);
    const codeLabels: CodeLabel[] = (mc.Labels ?? [])
      .filter((l) => !l.label.startsWith("__"))
      .map((l) => ({ address: l.address, name: l.label, origin: "compiler" }));
    return {
      ok: true,
      labels: {
        slots: withSuggestions(
          typed ? slotsFromMemoryTable(table) : slotsFromNames(mc.Memory ?? []),
          testbedParams(source),
        ),
        codeLabels,
        codeHash: mc.MachineCodeHashId,
        typed,
      },
    };
  } catch (e) {
    return { ok: false, error: parseCompileError((e as Error)?.message ?? "") };
  }
}
