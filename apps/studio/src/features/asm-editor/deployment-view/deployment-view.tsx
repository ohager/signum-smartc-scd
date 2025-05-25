import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Wallet,
  ArrowRight,
  AlertCircle,
  ExternalLink,
  Check,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import type { MachineData } from "../machine-data.ts";
import { Amount } from "@/components/ui/amount.tsx";
import { AdaptiveScrollArea } from "@/components/ui/adaptive-scroll-area.tsx";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import { WalletConnection } from "@/features/asm-editor/deployment-view/wallet-connection.tsx";

export function DeploymentView({ data }: { data: MachineData }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const walletStatus = useWalletStatus()

  const handleConnect = () => {
    setIsConnecting(true);
    //
  };

  return (
    <AdaptiveScrollArea>
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold">Deploy Smart Contract</h2>
        <Alert className="my-4">
          <AlertCircle className="h-4 w-4" color="red"/>
          <AlertTitle>Important Note</AlertTitle>
          <AlertDescription>
            Deploying a smart contract is irreversible. Make sure you have
            tested your contract thoroughly before deployment.
          </AlertDescription>
        </Alert>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contract Summary</CardTitle>
              <CardDescription>
                Review your contract before deployment
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Contract Name
                    </h4>
                    <p className="font-medium">{data.PName}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Activation Amount
                    </h4>
                    <p className="font-medium">
                      <Amount amount={data.PActivationAmount} isAtomic />
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    Description
                  </h4>
                  <p>{data.PDescription}</p>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Code Size
                    </h4>
                    <p className="font-medium">
                      {data.ByteCode.length / 2} bytes
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      Minimum Fee
                    </h4>
                    <p className="font-medium">
                      <Amount amount={data.MinimumFeeNQT ?? 0} isAtomic />
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Deployment Settings</CardTitle>
              <CardDescription>
                Configure your deployment parameters
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="activation-amount">
                      Activation Amount (SIGNA)
                    </Label>
                    <Input
                      id="activation-amount"
                      type="number"
                      defaultValue={(
                        Number.parseInt(data.PActivationAmount) / 100000000
                      ).toString()}
                    />
                    <p className="text-xs text-muted-foreground">
                      Initial balance for the contract
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee">Transaction Fee (SIGNA)</Label>
                    <Input
                      id="fee"
                      type="number"
                      defaultValue={(
                        Number.parseInt(data.MinimumFeeNQT) / 100000000
                      ).toString()}
                    />
                    <p className="text-xs text-muted-foreground">
                      Minimum:{" "}
                      {(
                        Number.parseInt(data.MinimumFeeNQT) / 100000000
                      ).toFixed(8)}{" "}
                      SIGNA
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deadline">Deadline (minutes)</Label>
                  <Input id="deadline" type="number" defaultValue="1440" />
                  <p className="text-xs text-muted-foreground">
                    Transaction deadline in minutes (max: 1440)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
         <WalletConnection />
        </div>
      </div>
    </AdaptiveScrollArea>
  );
}
