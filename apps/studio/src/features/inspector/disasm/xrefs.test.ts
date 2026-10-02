import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SmartC } from "smartc-signum-compiler";
import { capabilities, CAPABILITY_APIS } from "./capabilities";
import { decode } from "./decode";
import { API_BY_CODE } from "./opcode-index";
import { buildXrefs, slotUse } from "./xrefs";

const hex =
  "02" + "02000000" + "01000000" + // 0: SET @2 $1
  "06" + "02000000" + "01000000" + // 9: ADD @2 $1
  "14" + "03000000" + "01000000" + // 18: SET @($3) $1
  "12" + "1b000000" + // 27: JSR :27
  "32" + "0304" + // 32: FUN send_All_to_Address_in_B
  "28"; // 35: FIN
const xrefs = buildXrefs(decode(hex));

describe("buildXrefs", () => {
  it("records reads and writes per slot", () => {
    expect(slotUse(xrefs, 2)).toEqual({ reads: [9], writes: [0, 9] });
    expect(slotUse(xrefs, 1)).toEqual({ reads: [0, 9, 18], writes: [] });
    expect(slotUse(xrefs, 3)).toEqual({ reads: [18], writes: [] });
  });

  it("records writes through pointers separately", () => {
    expect(xrefs.writesThrough).toEqual([{ address: 18, pointer: 3 }]);
  });

  it("records incoming jumps and API call sites", () => {
    expect(xrefs.incoming.get(27)).toEqual([{ from: 27, kind: "call" }]);
    expect(xrefs.api.get("send_All_to_Address_in_B")).toEqual([32]);
  });

  it("derives capabilities from API calls only", () => {
    expect(capabilities(xrefs)).toEqual([{ capability: "sendsFunds", apis: ["send_All_to_Address_in_B"], sites: [32] }]);
  });
});

describe("capability table", () => {
  it("only names API functions the toolchain knows", () => {
    const known = new Set([...API_BY_CODE.values()].map((a) => a.name));
    expect(Object.values(CAPABILITY_APIS).flat().filter((n) => !known.has(n))).toEqual([]);
  });

  it("finds something in a real contract", () => {
    const source = readFileSync(join(import.meta.dir, "../../../../../../examples/stock.smart.c"), "utf8");
    const c = new SmartC({ language: "C", sourceCode: source });
    c.compile();
    expect(capabilities(buildXrefs(decode(c.getMachineCode().ByteCode))).length).toBeGreaterThan(0);
  });
});
