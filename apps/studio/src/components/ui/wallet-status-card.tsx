import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Wallet, Loader2, ExternalLink, UnplugIcon } from "lucide-react";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { Address } from "@signumjs/core";
import { useMemo } from "react";
import { Amount } from "@/components/ui/amount.tsx";
import { wallet } from "@/lib/wallet.ts";
import { WalletConnectButton } from "@/components/ui/wallet-connect-button.tsx";
import { useAccountBalance } from "@/hooks/use-account-balance.ts";
import { AccountAddress } from "@/components/ui/accountAddress.tsx";
import { ExplorerLink } from "@/components/ui/explorer-link.tsx";
import { t } from "@/i18n/runtime";

export function WalletStatusCard() {
  const status = useWalletStatus();
  const accountBalance = useAccountBalance();

  const disconnectWallet = () => {
    wallet.disconnect();
  };

  if (!status) {
    return <WalletConnectButton />;
  }

  return (
    <div className="mt-auto p-1 border-t">
      <Card className="w-full">
        <CardHeader className="pb-2">
          <div className="flex flex-col ">
            <CardTitle className="text-sm flex justify-between items-center gap-2">
              <div className="flex items-center gap-1">
                <Wallet className="h-4 w-4" />
                {/* i18n-ignore — product name */}
                XT Wallet
              </div>
              <Badge className="bg-[color-mix(in_srgb,var(--green)_15%,transparent)] text-[var(--green)]">
                {status.network === "TestNet" ? t("common.wallet.testnet") : t("common.wallet.mainnet")}
              </Badge>
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            {t("common.wallet.ready")}
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div>
              <span className="text-xs text-muted-foreground">{t("common.wallet.account")}</span>
              <AccountAddress />
            </div>

            <div className="flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">{t("common.wallet.balance")}</span>
              <span className="font-medium text-sm">
                {accountBalance.isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--accent-2)] mb-2" />
                ) : (
                  <Amount
                    amount={accountBalance.balance?.guaranteedBalanceNQT ?? 0}
                    isAtomic
                    className="text-sm"
                  />
                )}
              </span>
            </div>

            <Separator />

            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="flex-1 text-xs h-7"
                onClick={() => disconnectWallet()}
              >
                <UnplugIcon className="h-3 w-3 mr-1" />
                {t("common.actions.disconnect")}
              </Button>
              <ExplorerLink type="address" identifier={status.accountId ?? ""}>
                <Button variant="ghost" size="sm">
                  <ExternalLink className="h-3 w-3 mr-1" />
                  {t("common.actions.open")}
                </Button>
              </ExplorerLink>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
