export interface ScenarioTx {
  block: number; // 1-based; block 1 = first forged (activation) block
  sender: string; // numeric account id (bigint as string; "_" allowed)
  amount: string; // NQT string; "_" separators allowed
  txId?: string; // optional self-defined tx id (bigint as string); random if omitted
  message?: string; // → messageText
}

export interface ScenarioAccount {
  id: string; // numeric account id (bigint as string; "_" allowed)
  balance: string; // NQT string; "_" separators allowed
}

export interface ScenarioFile {
  version: 2;
  creator: string; // numeric account id (bigint as string)
  accounts: ScenarioAccount[];
  transactions: ScenarioTx[];
}
