import { describe, expect, it } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { SmartC } from "smartc-signum-compiler";
import { generateLabels } from "../compiler/label-generator";
import type { LabelMap } from "../model/label-map";
import { decode } from "./decode";
import { buildNames } from "./names";
import { mulberry32, randomProgram } from "./test-support";
import { toAsm, type Provenance } from "./to-asm";
import { verifyRoundTrip } from "./verify";

const ROOT = join(import.meta.dir, "../../../../../..");
const sources = [
  ...readdirSync(join(ROOT, "examples")).filter((f) => f.endsWith(".smart.c")).map((f) => join(ROOT, "examples", f)),
  join(ROOT, "apps/studio/src/features/testbed/__fixtures__/counter.smart.c"),
  join(ROOT, "apps/studio/src/features/inspector/compiler/__fixtures__/typed.smart.c"),
];

const provenance: Provenance = {
  contractId: "1", contractRS: "S-TEST", network: "testnet", codeHash: "0", creatorRS: "S-CREATOR",
  date: new Date("2026-10-02T00:00:00Z"), labelsFile: null,
};

function compile(source: string) {
  const c = new SmartC({ language: "C", sourceCode: source });
  c.compile();
  return c.getMachineCode().ByteCode.toLowerCase();
}

function labelMapFrom(source: string): LabelMap {
  const r = generateLabels(source);
  if (!r.ok) throw new Error(r.error.message);
  return { version: 1, name: "g", codeHashes: [], slots: r.labels.slots, maps: [], enums: {}, codeLabels: r.labels.codeLabels };
}

function roundTrip(hex: string, map: LabelMap | null) {
  const dis = decode(hex);
  expect(dis.assemblable).toBe(true);
  const asm = toAsm(dis, buildNames(dis, map, 0), provenance);
  return verifyRoundTrip(asm, dis, hex);
}

describe("round trip: disassemble → assemble with SmartC → identical bytes", () => {
  for (const file of sources) {
    const source = readFileSync(file, "utf8");
    it(`${file.split("/").pop()} without labels`, () => expect(roundTrip(compile(source), null)).toEqual({ ok: true }));
    it(`${file.split("/").pop()} with labels generated from its source`, () =>
      expect(roundTrip(compile(source), labelMapFrom(source))).toEqual({ ok: true }));
  }

  it("the real testnet contract, compared without its page padding", () => {
    const chain = readFileSync(join(import.meta.dir, "__fixtures__/stock.chain.hex"), "utf8").trim();
    const map = labelMapFrom(readFileSync(join(ROOT, "examples/stock.smart.c"), "utf8"));
    expect(roundTrip(chain, map)).toEqual({ ok: true });
  });

  it("300 random valid programs", () => {
    const rand = mulberry32(20261002);
    for (let n = 0; n < 300; n++) {
      const hex = randomProgram(rand, 1 + Math.floor(rand() * 40));
      expect({ n, result: roundTrip(hex, null) }).toEqual({ n, result: { ok: true } });
    }
  });

  it("1000 random byte strings never throw, and whatever claims to be assemblable is", () => {
    const rand = mulberry32(7);
    for (let n = 0; n < 1000; n++) {
      const hex = Array.from({ length: 1 + Math.floor(rand() * 80) }, () => Math.floor(rand() * 256).toString(16).padStart(2, "0")).join("");
      const dis = decode(hex);
      if (dis.assemblable && dis.instructions.length) {
        expect(verifyRoundTrip(toAsm(dis, buildNames(dis, null, 0), provenance), dis, hex)).toEqual({ ok: true });
      }
    }
  });
});

describe("toAsm", () => {
  it("puts provenance in single-line comments that cannot inject asm", () => {
    const dis = decode("28");
    const asm = toAsm(dis, buildNames(dis, null, 0), { ...provenance, contractRS: "S-X\n^declare evil", labelsFile: "a\r\nFIN" });
    expect(asm.split("\n").filter((l) => l.startsWith("^declare"))).toEqual([]);
    expect(asm.split("\n").filter((l) => l.trim() === "FIN")).toHaveLength(1);
    expect(asm.startsWith("^comment ")).toBe(true);
  });

  it("refuses a listing that is not assemblable", () => {
    const dis = decode("ff");
    expect(() => toAsm(dis, buildNames(dis, null, 0), provenance)).toThrow();
  });

  it("reports the first differing byte", () => {
    const dis = decode("28");
    expect(verifyRoundTrip("FIN\n", dis, "29")).toEqual({ ok: false, reason: "differs", byte: 0 });
  });
});
