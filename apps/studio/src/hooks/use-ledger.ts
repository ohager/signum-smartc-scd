import { useWalletStatus } from "@/hooks/use-wallet-status.ts";

export const useLedger = () => {
  const status = useWalletStatus()
  return status?.ledger ?? null
}
