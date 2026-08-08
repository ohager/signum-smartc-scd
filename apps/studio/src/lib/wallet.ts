import { jotaiStore } from "@/stores/jotai-store.ts";
import { walletConnectionStateAtom } from "@/stores/wallet-atoms.ts";
import type { NetworkType } from "@/types/wallet.types.ts";
import { createClient } from "@signumjs/core/createClient";
import { Crypto } from "@signumjs/crypto";
import { WebCryptoAdapter } from "@signumjs/crypto/adapters";
import { ExtensionWallet } from "@signumjs/wallets";

Crypto.init(new WebCryptoAdapter());

let walletInstance = new ExtensionWallet();

function disconnect() {
  walletInstance = new ExtensionWallet();
  jotaiStore.set(walletConnectionStateAtom, null);
}

export const wallet = {
  disconnect,
  connect: async (network: NetworkType) => {
    const connection = await walletInstance.connect({
      networkName: network === "MainNet" ? "Signum" : "Signum-TESTNET",
      appName: "Signum SmartC Studio",
    });
    connection.listen({
      onPermissionRemoved: ({ origin }) => {
        if (origin === window.location.origin) {
          disconnect();
        }
      },
      onNetworkChanged: ({ networkName, networkHost }) => {
        if (
          jotaiStore.get(walletConnectionStateAtom)?.network !== networkName
        ) {
          return disconnect();
        }

        jotaiStore.set(walletConnectionStateAtom, (prev) => {
          return prev
            ? {
                ...prev,
                network:
                  (networkName as string) === "Signum" ? "MainNet" : "TestNet",
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
      ledger: createClient({
        nodeHost: connection.currentNodeHost,
      }),
      watchOnly: connection.watchOnly,
    });
  },
  signTransaction: async (unsignedTransaction: string) => {
    return walletInstance.confirm(unsignedTransaction);
  },
};
