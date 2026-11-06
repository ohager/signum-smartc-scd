import { describe, expect, it } from "bun:test";
import { signaToPlanck } from "./amounts";

describe("signaToPlanck", () => {
  it("converts plain decimal SIGNA", () => {
    expect(signaToPlanck("1")).toBe("100000000");
    expect(signaToPlanck("0.5")).toBe("50000000");
    expect(signaToPlanck(" 0.00000001 ")).toBe("1");
  });

  it("refuses what Amount.fromSigna would throw on or what makes no sense to send", () => {
    expect(signaToPlanck("1e5")).toBeNull();
    expect(signaToPlanck("-1")).toBeNull();
    expect(signaToPlanck("")).toBeNull();
    expect(signaToPlanck("0.000000001")).toBeNull();
    expect(signaToPlanck("abc")).toBeNull();
  });
});
