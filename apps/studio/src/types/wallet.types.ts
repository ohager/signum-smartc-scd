export type NetworkType = 'MainNet' | 'TestNet'

export type WalletConnectionState = {
  accountId: string;
  publicKey: string;
  node: string;
  network: NetworkType;
  watchOnly: boolean;
}
