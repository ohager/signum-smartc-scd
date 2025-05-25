import { atom } from "jotai";
import type { WalletConnectionState } from "@/types/wallet.types.ts";

export const walletConnectionStateAtom = atom<WalletConnectionState | null>(null);
