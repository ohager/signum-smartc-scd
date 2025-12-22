import type { Ledger } from "@signumjs/core";

export type NetworkType = 'MainNet' | 'TestNet'

export type WalletConnectionState = {
  accountId: string;
  publicKey: string;
  ledger: Ledger;
  network: NetworkType;
  watchOnly: boolean;
}
