import { jotaiStore } from "@/stores/jotai-store.ts";
import { walletConnectionStateAtom } from "@/stores/wallet-atoms.ts";
import { GenericExtensionWallet, WalletConnection } from "@signumjs/wallets";
import type { NetworkType } from "@/types/wallet.types.ts";
import { LedgerClientFactory } from "@signumjs/core";
import asmCodeEditor from "@/features/asm-editor/code-editor/asm-code-editor.tsx";

let walletInstance = new GenericExtensionWallet();

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
        if(jotaiStore.get(walletConnectionStateAtom)?.network !== networkName){
          return disconnect()
        }

        jotaiStore.set(walletConnectionStateAtom, (prev) => {
          return prev
            ? {
                ...prev,
                network: networkName as string === "Signum" ? "MainNet" : "TestNet",
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
    return walletInstance.confirm(unsignedTransaction);
  },
};
