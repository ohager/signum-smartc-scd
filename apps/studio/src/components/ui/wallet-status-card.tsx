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
import {
  Wallet,
  Loader2,
  ExternalLink,
  RefreshCw,
  UnplugIcon,
  FlaskConicalIcon,
  CrownIcon, PlugIcon, PlugZap, PlugZapIcon
} from "lucide-react";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { Address } from "@signumjs/core";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { Amount } from "@/components/ui/amount.tsx";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu.tsx";
import type { NetworkType } from "@/types/wallet.types.ts";
import { wallet } from "@/lib/wallet.ts";
import { AlertDialog } from "@/components/ui/alert-dialog.tsx";

export function WalletStatusCard() {
  const status = useWalletStatus();
  const [connectionError, setConnectionError] = useState("");
  const [showAlertDialog, setShowAlertDialog] = useState(false);
  const [expectedNetwork, setExpectedNetwork] = useState<NetworkType>();

  const connectWallet = async (network: NetworkType) => {
    try {
      setExpectedNetwork(network);
      await wallet.connect(network);
    } catch (e) {
      setShowAlertDialog(true);
      setConnectionError(e.message);
    }
  };

  const disconnectWallet = () => {
    wallet.disconnect();
  };

  const address = useMemo(() => {
    if (!status) {
      return "";
    }
    return Address.create(
      status.accountId,
      status.network === "TestNet" ? "TS" : "S",
    ).getReedSolomonAddress(true);
  }, [status]);

  const { data: balance, isLoading } = useSWR(
    status && `getBalance/${status.accountId}`,
    () =>
      status ? status.ledger.account.getAccountBalance(status.accountId) : null,
    {
      refreshInterval: 60_000,
    },
  );

  if (!status) {
    return (
      <>
        <DropdownMenu>
          <DropdownMenuTrigger>
            <Button size="sm" className="w-full">
              <PlugZapIcon className="mr-1" />
              Connect Wallet
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-full">
            <DropdownMenuItem onClick={() => connectWallet("TestNet")}>
              <FlaskConicalIcon className="h-4 w-4" />
              Connect to Testnet
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => connectWallet("MainNet")}>
              <CrownIcon className="h-4 w-4" />
              Connect to Mainnet
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <AlertDialog
          open={showAlertDialog}
          onOpenChange={setShowAlertDialog}
          title="Connection Issue"
          type="warning"
          description={
            <div>
              {connectionError}
              <div className="border rounded-md p-2 mt-2 text-center">
                Expected Network: {expectedNetwork?.toUpperCase()}
              </div>
            </div>
          }
        />
      </>
    );
  }

  return (
    <div className="mt-auto p-1 border-t">
      <Card className="w-full">
        <CardHeader className="pb-2">
          <div className="flex flex-col ">
            <CardTitle className="text-sm flex justify-between items-center gap-2">
              <div className="flex items-center gap-1">
                <Wallet className="h-4 w-4" />
                XT Wallet
              </div>
              <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                {status.network === "TestNet" ? "Testnet" : "Mainnet"}
              </Badge>
            </CardTitle>
          </div>
          <CardDescription className="text-xs">
            Ready to deploy contracts
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="space-y-3">
            <div>
                <span className="text-xs text-muted-foreground">Account</span>
              <div className="font-mono text-xs break-all">{address}</div>
            </div>

            <div className="flex flex-col justify-between">
              <span className="text-xs text-muted-foreground">Balance</span>
              <span className="font-medium text-sm">
                {isLoading ? (
                  <Loader2 className="h-6 w-6 animate-spin text-blue-500 mb-2" />
                ) : (
                  <Amount
                    amount={balance?.guaranteedBalanceNQT ?? 0}
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
                Disconnect
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 text-xs h-7">
                <ExternalLink className="h-3 w-3 mr-1" />
                Open
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
