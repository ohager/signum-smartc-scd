import { describe, it, expect } from "bun:test";
import { toEngineTxs } from "./to-engine-txs";
import type { ScenarioFile } from "./scenario.types";

const scenario: ScenarioFile = {
  version: 1,
  contract: { creator: "c", activationAmount: "1" },
  accounts: [],
  timeline: [
    { type: "tx", sender: "alice", amount: "5" },
    { type: "blocks", count: 2 },
    { type: "tx", sender: "bob", amount: "3", message: "hi" },
  ],
};

describe("toEngineTxs", () => {
  it("assigns blockheights from the timeline and stamps the contract as recipient", () => {
    expect(toEngineTxs(scenario, "CONTRACT", 1)).toEqual([
      { sender: "alice", recipient: "CONTRACT", amount: "5", blockheight: 1 },
      { sender: "bob", recipient: "CONTRACT", amount: "3", blockheight: 3, message: "hi" },
    ]);
  });
  it("defaults the start height to 1", () => {
    const txs = toEngineTxs(scenario, "CONTRACT");
    expect(txs[0].blockheight).toBe(1);
  });
});
