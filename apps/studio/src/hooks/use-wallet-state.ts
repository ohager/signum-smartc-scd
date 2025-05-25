import { useAtomValue } from "jotai";
import {walletConnectionStateAtom } from "@/stores/wallet-atoms.ts";


export function useWalletState() {
  return useAtomValue(walletConnectionStateAtom)
}
