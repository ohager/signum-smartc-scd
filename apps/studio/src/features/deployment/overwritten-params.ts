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

export function findOverwrittenParams(assembly: string, memory: string[], paramIndexes: number[]): Overwrite[] {
  const wanted = new Map(paramIndexes.filter((i) => i >= 0).map((i) => [memory[i], i]));
  const found = new Map<number, number>();
  let line = 0;

  for (const text of assembly.split("\n")) {
    const trimmed = text.trim();
    // Top-level code ends where main begins.
    if (trimmed === "PCS" || trimmed === "__fn_main:") break;
    const source = SOURCE_LINE.exec(text);
    if (source) {
      line = Number(source[1]);
      continue;
    }
    const write = WRITE.exec(text);
    const index = write ? wanted.get(write[1]) : undefined;
    if (index !== undefined && !found.has(index)) found.set(index, line);
  }

  return [...found].map(([index, l]) => ({ index, line: l }));
}
