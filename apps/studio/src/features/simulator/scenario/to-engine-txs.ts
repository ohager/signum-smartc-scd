import type { ScenarioFile } from "./scenario.types";

export interface EngineTx {
  sender: string;
  recipient: string;
  amount: string;
  blockheight: number;
  message?: string;
}

export function toEngineTxs(scenario: ScenarioFile, contractId: string, startHeight = 1): EngineTx[] {
  const txs: EngineTx[] = [];
  let height = startHeight;
  for (const entry of scenario.timeline) {
    if (entry.type === "tx") {
      const tx: EngineTx = { sender: entry.sender, recipient: contractId, amount: entry.amount, blockheight: height };
      if (entry.message !== undefined) tx.message = entry.message;
      txs.push(tx);
    } else {
      height += entry.count;
    }
  }
  return txs;
}
