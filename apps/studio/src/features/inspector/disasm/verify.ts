import { SmartC } from "smartc-signum-compiler";
import type { Disassembly } from "./decode";

/**
 * The proof behind "this listing is the contract": assemble it with SmartC
 * and compare the bytes with the code on chain, without its page padding.
 */

export type VerifyResult =
  | { ok: true }
  | { ok: false; reason: "compile"; message: string }
  | { ok: false; reason: "differs"; byte: number };

export function verifyRoundTrip(asm: string, dis: Disassembly, originalHex: string): VerifyResult {
  let bytecode: string;
  try {
    const compiler = new SmartC({ language: "Assembly", sourceCode: asm });
    compiler.compile();
    bytecode = compiler.getMachineCode().ByteCode.toLowerCase();
  } catch (e) {
    return { ok: false, reason: "compile", message: (e as Error)?.message ?? String(e) };
  }
  const expected = originalHex.trim().toLowerCase().slice(0, dis.codeLength * 2);
  if (bytecode === expected) return { ok: true };
  let byte = 0;
  while (byte * 2 < Math.min(bytecode.length, expected.length) && bytecode.slice(byte * 2, byte * 2 + 2) === expected.slice(byte * 2, byte * 2 + 2)) byte++;
  return { ok: false, reason: "differs", byte };
}
