import { describe, it, expect } from "bun:test";
import { toEngineTxs } from "./to-engine-txs";
import type { ScenarioFile } from "./scenario.types";

const scenario: ScenarioFile = {
  version: 2,
  creator: "555",
  accounts: [],
  transactions: [
    { block: 1, sender: "1001", amount: "5" },
    { block: 3, sender: "1002", amount: "3", txId: "77", message: "hi" },
  ],
};

describe("toEngineTxs (v2)", () => {
  it("maps block N to engine blockheight N-1, stamps the contract recipient, and passes txId", () => {
    expect(toEngineTxs(scenario, "999")).toEqual([
      { sender: "1001", recipient: "999", amount: "5", blockheight: 0 },
      { sender: "1002", recipient: "999", amount: "3", blockheight: 2, txId: "77", message: "hi" },
    ]);
  });
});
