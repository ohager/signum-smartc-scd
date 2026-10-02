import { describe, expect, it } from "bun:test";
import type { LabelMap } from "../model/label-map";
import { decode } from "./decode";
import { buildNames, displayCodeName, sanitize } from "./names";

const map = (over: Partial<LabelMap>): LabelMap => ({
  version: 1, name: "m", codeHashes: [], slots: [], maps: [], enums: {}, codeLabels: [], ...over,
});

describe("sanitize", () => {
  it("makes any name a valid asm identifier", () => {
    expect(sanitize("sale.price")).toBe("sale_price");
    expect(sanitize("2nd")).toBe("_2nd");
    expect(sanitize("")).toBe("_");
    expect(sanitize("ünïcode name")).toBe("_n_code_name");
  });
});

describe("displayCodeName", () => {
  it("shortens compiler function labels only", () => {
    expect(displayCodeName("__fn_helper")).toBe("helper");
    expect(displayCodeName("__if12_endif")).toBe("__if12_endif");
    expect(displayCodeName("sellNft")).toBe("sellNft");
  });
});

describe("buildNames", () => {
  // SET @3 $0 · JMP :0
  const dis = decode("02" + "03000000" + "00000000" + "1a" + "00000000");

  it("names every slot up to the highest used or present, without gaps", () => {
    const names = buildNames(dis, null, 2);
    expect(names.slotCount).toBe(4);
    expect(names.slotAsm).toEqual(["var_000", "var_001", "var_002", "var_003"]);
    expect(names.slotDisplay).toEqual([null, null, null, null]);
  });

  it("uses labels, array items and collision-free asm names", () => {
    const names = buildNames(
      dis,
      map({
        slots: [
          { index: 0, name: "sale.price" },
          { index: 1, name: "sale_price" },
          { index: 2, name: "prices", length: 2 },
        ],
      }),
      0,
    );
    expect(names.slotAsm).toEqual(["sale_price", "sale_price_2", "prices_0", "prices_1"]);
    expect(names.slotDisplay).toEqual(["sale.price", "sale_price", "prices[0]", "prices[1]"]);
  });

  it("names targets from code labels, compiler functions or their address", () => {
    const named = buildNames(dis, map({ codeLabels: [{ address: 0, name: "__fn_main", origin: "compiler" }] }), 0);
    expect(named.targetAsm.get(0)).toBe("__fn_main");
    expect(named.targetDisplay.get(0)).toBe("main");
    expect(buildNames(dis, null, 0).targetAsm.get(0)).toBe("lab_0000");
  });

  it("keeps slot and label names apart", () => {
    const names = buildNames(
      dis,
      map({ slots: [{ index: 0, name: "loop" }], codeLabels: [{ address: 0, name: "loop" }] }),
      0,
    );
    expect(names.slotAsm[0]).toBe("loop");
    expect(names.targetAsm.get(0)).toBe("loop_2");
  });
});

describe("buildNames, defensive", () => {
  const dis = decode("02" + "03000000" + "00000000" + "1a" + "00000000");

  it("prefers a person's code name over a compiler one at the same address", () => {
    const names = buildNames(
      dis,
      map({ codeLabels: [{ address: 0, name: "mine", origin: "manual" }, { address: 0, name: "__fn_main", origin: "compiler" }] }),
      0,
    );
    expect(names.targetDisplay.get(0)).toBe("mine");
  });

  it("does not let a label far beyond the code and data stretch the declarations", () => {
    const names = buildNames(dis, map({ slots: [{ index: 50_000, name: "typo" }] }), 2);
    expect(names.slotCount).toBe(4);
  });
});
