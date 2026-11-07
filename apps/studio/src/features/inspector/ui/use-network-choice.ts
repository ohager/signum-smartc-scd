import { useCallback, useMemo, useState } from "react";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { defaultChoice, parseStoredChoice, type NetworkChoice, type WalletNode } from "../model/network-choice";

const STORAGE_KEY = "studio:inspector:network";

/** The node the connected wallet talks to, or null without a wallet. */
export function useWalletNode(): WalletNode | null {
  const wallet = useWalletStatus();
  const node = wallet?.ledger.service.settings.nodeHost;
  const testnet = wallet?.network === "TestNet";
  return useMemo(() => (node ? { node, testnet } : null), [node, testnet]);
}

function readStored(): NetworkChoice | null {
  try {
    return parseStoredChoice(localStorage.getItem(STORAGE_KEY));
  } catch {
    return null;
  }
}

/**
 * The picker's last choice, kept across sessions. Without one, the wallet's
 * node is the default — and stays so while nothing is stored, so connecting
 * the wallet later still moves the picker to it.
 */
export function useNetworkChoice(): [NetworkChoice, (next: NetworkChoice) => void] {
  const wallet = useWalletNode();
  const [stored, setStored] = useState<NetworkChoice | null>(readStored);
  const save = useCallback((next: NetworkChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage unavailable: the choice still holds for this session.
    }
    setStored(next);
  }, []);
  return [stored ?? defaultChoice(wallet), save];
}
