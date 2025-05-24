import { SmartC } from "smartc-signum-compiler";
import type { MachineData } from "../machine-data.ts";

/**
 * Tries to assemble the given assembly code.
 * @param asmCode
 * @returns the machine data
 * @throws Error when assembly fails
 */
export function tryAssemble(asmCode: string): MachineData {
  const compiler = new SmartC({
    language: "Assembly",
    sourceCode: asmCode
  });
  return compiler.compile().getMachineCode();
}
