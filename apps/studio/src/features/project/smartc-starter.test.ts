import { describe, it, expect } from "bun:test";
import { contractNameFrom, smartcStarter } from "./smartc-starter";

describe("contractNameFrom", () => {
  it("PascalCases separated words", () => {
    expect(contractNameFrom("my-contract")).toBe("MyContract");
    expect(contractNameFrom("my contract v2")).toBe("MyContractV2");
    expect(contractNameFrom("collector_token")).toBe("CollectorToken");
  });
  it("keeps inner casing and capitalises the first letter", () => {
    expect(contractNameFrom("collectorToken")).toBe("CollectorToken");
  });
  it("truncates to the compiler's 30 char limit", () => {
    expect(contractNameFrom("a".repeat(40))).toHaveLength(30);
  });
  it("falls back when nothing usable remains", () => {
    expect(contractNameFrom("---")).toBe("MyContract");
    expect(contractNameFrom("")).toBe("MyContract");
  });
});

describe("smartcStarter", () => {
  it("names the program after the file", () => {
    expect(smartcStarter("my-contract")).toContain("#program name MyContract");
  });
  it("emits only characters the compiler accepts in a program name", () => {
    const name =
      smartcStarter("my-contract 2!").match(/#program name (.*)/)![1];
    expect(name).toMatch(/^[a-zA-Z0-9]{1,30}$/);
  });
  it("uses the getNextTx loop + switch dispatch pattern", () => {
    const src = smartcStarter("demo");
    expect(src).toContain("while ((currentTx.txId = getNextTx()) != 0)");
    expect(src).toContain("switch (currentTx.message[0])");
  });
});
