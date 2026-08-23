import { describe, it, expect } from "bun:test";
import { toDebugScenario } from "./to-debug-scenario";
import type { TestRecording } from "./runner/recording";

const base = (over: Partial<TestRecording> = {}): TestRecording => ({
  allContractSources: ["#program name X"],
  contractSource: "#program name X",
  transactions: [],
  ...over,
});

describe("toDebugScenario", () => {
  it("maps a transaction to a scenario transaction", () => {
    const s = toDebugScenario(
      base({ transactions: [{ blockheight: 1, amount: 2_0000_0000n, sender: 10n }] }),
    );
    expect(s.transactions[0]).toMatchObject({ block: 1, sender: "10", amount: "200000000" });
  });

  it("defaults a missing blockheight to block 1", () => {
    const s = toDebugScenario(base({ transactions: [{ amount: 1n, sender: 10n }] }));
    expect(s.transactions[0].block).toBe(1);
  });

  it("carries messageText and messageHex", () => {
    const s = toDebugScenario(
      base({
        transactions: [
          { blockheight: 1, amount: 1n, sender: 10n, messageText: "hi" },
          { blockheight: 2, amount: 1n, sender: 10n, messageHex: "00ff" },
        ],
      }),
    );
    expect(s.transactions[0].message).toBe("hi");
    expect(s.transactions[1].messageHex).toBe("00ff");
  });

  it("funds each sender with its total outgoing plus headroom", () => {
    const s = toDebugScenario(
      base({
        transactions: [
          { blockheight: 1, amount: 5_0000_0000n, sender: 10n },
          { blockheight: 2, amount: 3_0000_0000n, sender: 10n },
        ],
      }),
    );
    // 8 SIGNA sent + 1 SIGNA headroom
    expect(s.accounts).toEqual([{ id: "10", balance: "900000000" }]);
  });

  it("funds each distinct sender separately", () => {
    const s = toDebugScenario(
      base({
        transactions: [
          { blockheight: 1, amount: 1_0000_0000n, sender: 10n },
          { blockheight: 1, amount: 2_0000_0000n, sender: 20n },
        ],
      }),
    );
    expect(s.accounts.map((a) => a.id).sort()).toEqual(["10", "20"]);
  });

  it("uses the recorded creator when there is one", () => {
    expect(toDebugScenario(base({ creator: 777n })).creator).toBe("777");
  });

  it("falls back to the testbed's default creator", () => {
    expect(toDebugScenario(base()).creator).toBe("555");
  });

  it("produces a version 2 scenario", () => {
    expect(toDebugScenario(base()).version).toBe(2);
  });
});
