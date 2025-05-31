import useSWR from "swr";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";

export function useAccountBalance() {
  const status = useWalletStatus()

  const { data, isLoading } = useSWR(
    status && `${status.ledger.service.settings.nodeHost}/getBalance/${status.accountId}`,
    () =>
      status ? status.ledger.account.getAccountBalance(status.accountId) : null,
    {
      refreshInterval: 60_000,
    },
  );

  return {
    balance: data ?? null,
    isLoading,
  }

}
