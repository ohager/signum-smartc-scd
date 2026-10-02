import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SmartC } from "smartc-signum-compiler";
import { decode } from "./decode";
import { buildOutline } from "./outline";

function compiled(file: string) {
  const c = new SmartC({ language: "C", sourceCode: readFileSync(join(import.meta.dir, "__fixtures__", file), "utf8") });
  c.compile();
  return c.getMachineCode();
}

describe("buildOutline", () => {
  it("finds start, restart, functions with callers, and sections that tile the code", () => {
    const mc = compiled("outline.smart.c");
    const dis = decode(mc.ByteCode);
    const outline = buildOutline(dis);
    const addAt = mc.Labels.find((l) => l.label === "__fn_add")!.address;

    expect(outline.sections[0]).toMatchObject({ address: 0 });
    expect(outline.sections[0]!.kinds).toContain("start");
    expect(outline.sections.some((s) => s.kinds.includes("restart"))).toBe(true);
    const add = outline.sections.find((s) => s.address === addAt)!;
    expect(add.kinds).toContain("function");
    expect(add.callers).toHaveLength(2);

    for (let i = 1; i < outline.sections.length; i++) {
      expect(outline.sections[i - 1]!.end).toBe(outline.sections[i]!.address);
    }
    expect(outline.sections.at(-1)!.end).toBe(dis.codeLength);
  });

  it("starts a block at every target and after every jump or end", () => {
    // 0: BZR $0 :12 · 6: INC @0 · 11: FIN · 12: INC @0
    const dis = decode("1b" + "00000000" + "0c" + "04" + "00000000" + "28" + "04" + "00000000");
    const { blockStarts } = buildOutline(dis);
    // 6 follows a branch, 12 is the branch target and follows FIN
    expect([...blockStarts].sort((a, b) => a - b)).toEqual([0, 6, 12]);
  });

  it("marks ERR targets as error handlers", () => {
    const dis = decode("2b" + "05000000" + "28"); // ERR :5 · FIN
    expect(buildOutline(dis).sections.find((s) => s.address === 5)!.kinds).toEqual(["error"]);
  });
});
