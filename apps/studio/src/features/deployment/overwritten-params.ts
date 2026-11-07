import { SmartC } from "smartc-signum-compiler";

/**
 * A deploy parameter is only worth setting if the contract does not write
 * the slot itself before `main` — global initialisers and init-section code
 * run on first activation and replace whatever the deployment put there.
 *
 * The compiler's verbose assembly says which source line each instruction
 * comes from. Appending the pragma turns it on even if the source switched it
 * off earlier; it emits no bytes and shifts no lines.
 */

export interface Overwrite {
  index: number;
  /** 1-based source line of the first write. */
  line: number;
}

export function compileVerbose(source: string): { assembly: string; memory: string[] } | null {
  try {
    const compiler = new SmartC({ language: "C", sourceCode: source + "\n#pragma verboseAssembly true\n" });
    compiler.compile();
    return { assembly: compiler.getAssemblyCode(), memory: compiler.getMachineCode().Memory };
  } catch {
    return null;
  }
}

const SOURCE_LINE = /^\s*\^comment line (\d+)\b/;
/** Mnemonic, then the written operand. `^const` lines are initial data, not code. */
const WRITE = /^\s*[A-Z]+\s+@(\w+)\b/;
const CALL = /^\s*JSR\s+:(__fn_\w+)\b/;
const FUNCTION_LABEL = /^\s*(__fn_\w+):\s*$/;

/** What each function writes and calls, so a write inside an init-time helper is found too. */
function functionBodies(lines: string[]): Map<string, { writes: Set<string>; calls: Set<string> }> {
  const bodies = new Map<string, { writes: Set<string>; calls: Set<string> }>();
  let current: { writes: Set<string>; calls: Set<string> } | null = null;
  for (const text of lines) {
    const label = FUNCTION_LABEL.exec(text);
    if (label) {
      current = { writes: new Set(), calls: new Set() };
      bodies.set(label[1]!, current);
      continue;
    }
    if (!current) continue;
    const call = CALL.exec(text);
    if (call) current.calls.add(call[1]!);
    else {
      const write = WRITE.exec(text);
      if (write) current.writes.add(write[1]!);
    }
  }
  return bodies;
}

function writesOf(fn: string, bodies: ReturnType<typeof functionBodies>, seen = new Set<string>()): Set<string> {
  const out = new Set<string>();
  if (seen.has(fn)) return out;
  seen.add(fn);
  const body = bodies.get(fn);
  if (!body) return out;
  body.writes.forEach((w) => out.add(w));
  body.calls.forEach((c) => writesOf(c, bodies, seen).forEach((w) => out.add(w)));
  return out;
}

export function findOverwrittenParams(assembly: string, memory: string[], paramIndexes: number[]): Overwrite[] {
  const wanted = new Map(paramIndexes.filter((i) => i >= 0).map((i) => [memory[i], i]));
  const found = new Map<number, number>();
  const lines = assembly.split("\n");
  const bodies = functionBodies(lines);
  const note = (name: string, line: number) => {
    const index = wanted.get(name);
    if (index !== undefined && !found.has(index)) found.set(index, line);
  };
  let line = 0;

  for (const text of lines) {
    const trimmed = text.trim();
    // Top-level code ends where main begins.
    if (trimmed === "PCS" || trimmed === "__fn_main:") break;
    const source = SOURCE_LINE.exec(text);
    if (source) {
      line = Number(source[1]);
      continue;
    }
    // A call runs its function (and whatever that calls) before main, at this line.
    const call = CALL.exec(text);
    if (call) {
      writesOf(call[1]!, bodies).forEach((name) => note(name, line));
      continue;
    }
    const write = WRITE.exec(text);
    if (write) note(write[1]!, line);
  }

  return [...found].map(([index, l]) => ({ index, line: l }));
}
