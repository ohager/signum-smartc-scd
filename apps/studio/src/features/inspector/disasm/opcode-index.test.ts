import { describe, expect, it } from "bun:test";
import { API_BY_CODE, FORM_BY_OPCODE, FORMS, parseForm } from "./opcode-index";

const ASSEMBLER = require.resolve("smartc-signum-compiler/dist/assembler/assembler.js");
const source = await Bun.file(ASSEMBLER).text();

/** `{ opCode: 0x01, name: 'SET_VAL', size: 13, argsType: ['I', 'L'], …` */
const table = [
  ...source.matchAll(/\{\s*opCode:\s*(0x[0-9a-f]+),\s*name:\s*'(\w+)',\s*size:\s*(\d+),\s*argsType:\s*\[([^\]]*)\]/g),
].map((m) => ({ name: m[2]!, opCode: Number(m[1]), args: (m[4]!.match(/[ILBJF]/g) ?? []).join("") }));
const real = table.filter((e) => e.opCode < 0xf0);

describe("operand layout parsed from the documented syntax", () => {
  it("matches the assembler's argsType for every instruction", () => {
    const byName = new Map(FORMS.map((f) => [f.name, f]));
    const mismatches = real
      .map((e) => ({ name: e.name, expected: e.args, actual: byName.get(e.name)?.operands.map((o) => o.type).join("") }))
      .filter((m) => m.expected !== m.actual);
    expect(real.length).toBeGreaterThan(40);
    expect(mismatches).toEqual([]);
  });

  it("indexes every form by its opcode byte", () => {
    for (const e of real) expect(FORM_BY_OPCODE.get(e.opCode)?.name).toBe(e.name);
  });

  it("classifies access from the syntax", () => {
    const access = (opCode: number) => FORM_BY_OPCODE.get(opCode)!.operands.map((o) => `${o.type}:${o.access ?? ""}${o.writesThrough ? "*" : ""}`);
    expect(access(0x02)).toEqual(["I:write", "I:read"]); // SET @dest $var
    expect(access(0x06)).toEqual(["I:readwrite", "I:read"]); // ADD @dest $var
    expect(access(0x04)).toEqual(["I:readwrite"]); // INC @dest
    expect(access(0x03)).toEqual(["I:write"]); // CLR @dest
    expect(access(0x14)).toEqual(["I:read*", "I:read"]); // SET @($ptr) $var
    expect(access(0x15)).toEqual(["I:read*", "I:read*", "I:read"]); // SET @($ptr + $idx) $var
    expect(access(0x0f)).toEqual(["I:write", "I:read", "I:read"]); // SET @dest $($ptr + $idx)
    expect(access(0x36)).toEqual(["F:", "I:write", "I:read"]); // FUN @dest name $var1 — F encodes first
    expect(access(0x1b)).toEqual(["I:read", "B:"]); // BZR $var :label
  });

  it("keeps syntax order in parts while operands follow byte order", () => {
    const f = parseForm("FUN", { syntax: "FUN @dest name $var1", name: "EXT_FUN_RET_DAT", opCode: 0x36, size: 11 });
    expect(f.parts).toEqual(["FUN @", 1, " ", 0, " $", 2]);
  });
});

describe("API table", () => {
  const api = [...source.matchAll(/\{\s*name:\s*'(\w+)',\s*apiCode:\s*(0x[0-9a-f]+),\s*opCode:\s*(0x[0-9a-f]+)\s*\}/g)].map((m) => ({
    name: m[1]!, code: Number(m[2]), opCode: Number(m[3]),
  }));

  it("matches the assembler's API table exactly", () => {
    expect(api.length).toBeGreaterThan(80);
    const ours = [...API_BY_CODE.values()].map((a) => `${a.name}:${a.code}:${a.opCode}`).sort();
    expect(ours).toEqual(api.map((a) => `${a.name}:${a.code}:${a.opCode}`).sort());
  });
});
