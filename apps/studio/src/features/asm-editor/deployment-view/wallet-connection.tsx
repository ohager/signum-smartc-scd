import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card.tsx";
import { ArrowRight, Check, ExternalLink, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button.tsx";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert.tsx";
import { Badge } from "@/components/ui/badge.tsx";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { WalletConnectButton } from "@/components/ui/wallet-connect-button.tsx";
import { useAccountBalance } from "@/hooks/use-account-balance.ts";
import { AccountAddress } from "@/components/ui/accountAddress.tsx";
import { Amount } from "@/components/ui/amount.tsx";
import { ExplorerLink } from "@/components/ui/explorer-link.tsx";
import { t } from "@/i18n/runtime";

export function WalletConnection() {
  const walletStatus = useWalletStatus();
  const accountBalance = useAccountBalance();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t("asm-editor.wallet.title")}</CardTitle>
        <CardDescription>
          {t("asm-editor.wallet.subtitle")}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!walletStatus ? (
          <div className="text-center">
            <WalletConnectButton size="lg" variant="accent" />
          </div>
        ) : (
          <div className="space-y-4">
            <Alert className="border-[var(--green)] bg-[color-mix(in_srgb,var(--green)_10%,transparent)]">
              <Check className="h-4 w-4 text-[var(--green)]" />
              <AlertTitle className="flex justify-between items-center">
                {t("asm-editor.wallet.connected")}
                <Badge variant="outline">
                  {walletStatus.network.toUpperCase()}
                </Badge>
              </AlertTitle>
              <AlertDescription>
                {t("asm-editor.wallet.connectedBody")}
              </AlertDescription>
            </Alert>

            <div className="p-4 flex flex-col gap-y-2 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">{t("common.wallet.account")}</span>
                <AccountAddress className="!text-base" />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">{t("common.wallet.balance")}</span>
                <span className="font-medium">
                  {accountBalance.isLoading ? (
                    <div>...</div>
                  ) : (
                    <Amount
                      amount={accountBalance.balance?.guaranteedBalanceNQT ?? 0}
                      isAtomic
                    />
                  )}
                </span>
              </div>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-center">
        <ExplorerLink identifier={walletStatus?.accountId ?? ""} type="address">
          <Button variant="outline">
            <ExternalLink className="h-4 w-4 mr-2" />
            {t("asm-editor.wallet.openExplorer")}
          </Button>
        </ExplorerLink>
      </CardFooter>
    </Card>
  );
}
