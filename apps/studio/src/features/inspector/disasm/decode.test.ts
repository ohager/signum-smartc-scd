import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SmartC } from "smartc-signum-compiler";
import { decode, MAX_SLOT } from "./decode";

const chain = readFileSync(join(import.meta.dir, "__fixtures__/stock.chain.hex"), "utf8").trim();
const stockSource = readFileSync(join(import.meta.dir, "../../../../../../examples/stock.smart.c"), "utf8");

describe("decode", () => {
  it("decodes typed operands", () => {
    // SET @3 $0 · BZR $3 :+6 · JMP :0 · FUN @2 get_A1 · FIN
    const hex = "02" + "03000000" + "00000000" + "1b" + "03000000" + "06" + "1a" + "00000000" + "35" + "0001" + "02000000" + "28";
    const d = decode(hex);
    expect(d.instructions.map((i) => i.form.name)).toEqual(["SET_DAT", "BZR_DAT", "JMP_ADR", "EXT_FUN_RET", "FIN_IMD"]);
    expect(d.instructions[0]!.operands).toEqual([
      { kind: "slot", index: 3, access: "write", writesThrough: false },
      { kind: "slot", index: 0, access: "read", writesThrough: false },
    ]);
    expect(d.instructions[1]!.operands[1]).toEqual({ kind: "target", address: 15, relative: true });
    expect(d.instructions[3]!.operands[0]).toEqual({ kind: "api", code: 0x0100, name: "get_A1" });
    expect(d.assemblable).toBe(true);
  });

  it("resolves negative branch offsets", () => {
    const hex = "04" + "00000000" + "1e" + "00000000" + "fb"; // INC @0 · BNZ $0 :-5
    expect(decode(hex).instructions[1]!.operands[1]).toEqual({ kind: "target", address: 0, relative: true });
  });

  it("treats trailing zero bytes as padding only at an instruction boundary", () => {
    // SET @0 #0000000000000000 ends in eight 00 bytes that belong to the instruction
    const hex = "01" + "00000000" + "0000000000000000" + "0000000000";
    const d = decode(hex);
    expect(d.instructions).toHaveLength(1);
    expect(d.instructions[0]!.size).toBe(13);
    expect(d.codeLength).toBe(13);
    expect(d.rows.at(-1)).toEqual({ kind: "padding", address: 13, size: 5 });
  });

  it("turns bad bytes into unknown rows and keeps going", () => {
    const reasons = (hex: string) =>
      decode(hex).rows.flatMap((r) => (r.kind === "unknown" ? [r.reason] : []));
    // Each case on its own: in one stream, a later byte could become part of an earlier instruction.
    expect(reasons("ff")).toEqual(["opcode"]);
    expect(reasons("33" + "0001" + "05000000")[0]).toBe("api"); // get_A1 is a 0x35 function, not 0x33
    expect(reasons("04" + "ffffff7f")[0]).toBe("slot");
    expect(reasons("02" + "0000")[0]).toBe("truncated");
    const resumed = decode("ff" + "28");
    expect(resumed.instructions.map((i) => i.form.mnemonic)).toEqual(["FIN"]);
    expect(resumed.assemblable).toBe(false);
    expect(MAX_SLOT).toBe(0x1fff);
  });

  it("flags targets that do not land on an instruction", () => {
    const d = decode("1a" + "02000000" + "28"); // JMP :2 (inside the JMP itself)
    expect(d.misaligned).toEqual([0]);
    expect(d.assemblable).toBe(false);
  });

  it("never throws on odd input", () => {
    for (const hex of ["", "0", "zz", "02", "00", "  1A00000000  "]) expect(() => decode(hex)).not.toThrow();
  });

  it("decodes the real testnet contract up to its page padding", () => {
    const compiled = new SmartC({ language: "C", sourceCode: stockSource });
    compiled.compile();
    const code = compiled.getMachineCode().ByteCode.toLowerCase();
    const d = decode(chain);
    expect(chain.length / 2).toBe(4096);
    expect(d.codeLength).toBe(code.length / 2);
    expect(d.rows.at(-1)).toMatchObject({ kind: "padding", size: 4096 - code.length / 2 });
    expect(d.assemblable).toBe(true);
  });
});
