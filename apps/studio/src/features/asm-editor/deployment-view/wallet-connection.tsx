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

export function WalletConnection() {
  const walletStatus = useWalletStatus();
  const accountBalance = useAccountBalance();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Wallet Connection</CardTitle>
        <CardDescription>
          Connect to XT Wallet to deploy your contract
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!walletStatus ? (
          <div className="text-center">
            <WalletConnectButton size="lg" variant="accent" />
          </div>
        ) : (
          <div className="space-y-4">
            <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900">
              <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="flex justify-between items-center">
                Wallet Connected
                <Badge variant="outline">
                  {walletStatus.network.toUpperCase()}
                </Badge>
              </AlertTitle>
              <AlertDescription>
                Your XT Wallet is connected and ready to deploy.
              </AlertDescription>
            </Alert>

            <div className="p-4 flex flex-col gap-y-2 rounded-lg">
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Account</span>
                <AccountAddress className="!text-base" />
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground text-sm">Balance</span>
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
            Open In Explorer
          </Button>
        </ExplorerLink>
      </CardFooter>
    </Card>
  );
}
