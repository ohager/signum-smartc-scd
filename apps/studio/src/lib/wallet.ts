import { jotaiStore } from "@/stores/jotai-store.ts";
import { walletConnectionStateAtom } from "@/stores/wallet-atoms.ts";
import { GenericExtensionWallet, WalletConnection } from "@signumjs/wallets";
import type { NetworkType } from "@/types/wallet.types.ts";
import { LedgerClientFactory } from "@signumjs/core";
import asmCodeEditor from "@/features/asm-editor/code-editor/asm-code-editor.tsx";

let walletInstance = new GenericExtensionWallet();
let connection: WalletConnection | null = null;

function disconnect() {
  walletInstance = new GenericExtensionWallet();
  jotaiStore.set(walletConnectionStateAtom, null);
}

export const wallet = {
  disconnect,
  connect: async (network: NetworkType) => {
    const connection = await walletInstance.connect({
      networkName: network === "MainNet" ? "Signum" : "Signum-TESTNET",
      appName: "SCD Studio",
    });
    connection.listen({
      onPermissionRemoved: ({ origin }) => {
        if (origin === window.location.origin) {
          disconnect();
        }
      },
      onNetworkChanged: ({ networkName, networkHost }) => {
        jotaiStore.set(walletConnectionStateAtom, (prev) => {
          return prev
            ? {
                ...prev,
                network: networkName === "Signum" ? "MainNet" : "TestNet",
                node: networkHost,
              }
            : null;
        });
      },
      onAccountChanged: ({ accountId, accountPublicKey }) => {
        jotaiStore.set(walletConnectionStateAtom, (prev) => {
          return prev
            ? {
                ...prev,
                accountId,
                publicKey: accountPublicKey,
              }
            : null;
        });
      },
      onAccountRemoved: ({ accountId }) => {
        jotaiStore.set(walletConnectionStateAtom, (prev) => {
          if (prev?.accountId === accountId) {
            disconnect();
          }
          return prev;
        });
      },
    });
    jotaiStore.set(walletConnectionStateAtom, {
      network,
      accountId: connection.accountId,
      publicKey: connection.publicKey,
      ledger: LedgerClientFactory.createClient({
        nodeHost: connection.currentNodeHost,
      }),
      watchOnly: connection.watchOnly,
    });
  },
  signTransaction: async (unsignedTransaction: string) => {
    if (!connection) throw new Error("Wallet not connected");
    await walletInstance.confirm(unsignedTransaction);
  },
};
