import {
  functionBodies,
  MAP_WRITE_API,
  reachableBodies,
  SEND_API,
  SOURCE_LINE,
  WRITE,
} from "@/features/deployment/overwritten-params";

/**
 * What a piece of code does to the contract's state, read from the compiler's
 * assembly rather than guessed from source: the compiler has already resolved
 * `count++`, struct members and macros into plain instructions.
 */

export interface Effects {
  /** Globals written, by memory name. */
  globals: string[];
  sends: boolean;
  mapWrites: boolean;
}

export interface AssemblyEffects {
  /** Everything the function does, including what it calls. */
  ofFunction(name: string): Effects;
  /** What source lines `start..end` do themselves; calls are not followed. */
  ofLines(start: number, end: number): Effects;
}

export function changesState(e: Effects): boolean {
  return e.globals.length > 0 || e.sends || e.mapWrites;
}

/* The instruction patterns live with `functionBodies`, so "what counts as a write" has one definition. */

export function assemblyEffects(verbose: { assembly: string; memory: string[] }, functionNames: string[]): AssemblyEffects {
  const lines = verbose.assembly.split("\n");
  const bodies = functionBodies(lines);
  const memory = new Set(verbose.memory);
  // Registers, compiler internals (`_counterTimestamp`) and `<fn>_<local>` are not contract state.
  const isGlobal = (name: string) =>
    memory.has(name) && !/^r\d+$/.test(name) && !name.startsWith("_") && !functionNames.some((fn) => name.startsWith(`${fn}_`));

  return {
    ofFunction(name) {
      const reached = reachableBodies(`__fn_${name}`, bodies);
      return {
        globals: [...new Set(reached.flatMap((b) => [...b.writes]).filter(isGlobal))],
        sends: reached.some((b) => b.sends),
        mapWrites: reached.some((b) => b.mapWrites),
      };
    },
    ofLines(start, end) {
      const globals = new Set<string>();
      let sends = false;
      let mapWrites = false;
      let line = 0;
      for (const text of lines) {
        const marker = SOURCE_LINE.exec(text);
        if (marker) {
          line = Number(marker[1]);
          continue;
        }
        if (line < start || line > end) continue;
        const write = WRITE.exec(text);
        if (write && isGlobal(write[1]!)) globals.add(write[1]!);
        if (SEND_API.test(text)) sends = true;
        if (MAP_WRITE_API.test(text)) mapWrites = true;
      }
      return { globals: [...globals], sends, mapWrites };
    },
  };
}
