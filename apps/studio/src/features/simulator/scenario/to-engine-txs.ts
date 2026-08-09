import type { ScenarioFile } from "./scenario.types";

export interface EngineTx {
  sender: string;
  recipient: string;
  amount: string;
  blockheight: number; // engine height = scenario block - 1
  txId?: string;
  message?: string;
}

/**
 * Maps a v2 scenario's transactions to engine txs. A 1-based `block` maps to the
 * engine's 0-based `blockheight` (block 1 = first forged block = height 0).
 */
export function toEngineTxs(scenario: ScenarioFile, contractId: string): EngineTx[] {
  return scenario.transactions.map((tx) => {
    const t: EngineTx = {
      sender: tx.sender,
      recipient: contractId,
      amount: tx.amount,
      blockheight: tx.block - 1,
    };
    if (tx.txId !== undefined) t.txId = tx.txId;
    if (tx.message !== undefined) t.message = tx.message;
    return t;
  });
}
