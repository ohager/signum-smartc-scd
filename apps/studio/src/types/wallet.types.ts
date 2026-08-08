import type { StandardLedger } from "@signumjs/core";

export type NetworkType = 'MainNet' | 'TestNet'

export type WalletConnectionState = {
  accountId: string;
  publicKey: string;
  ledger: StandardLedger;
  network: NetworkType;
  watchOnly: boolean;
}
