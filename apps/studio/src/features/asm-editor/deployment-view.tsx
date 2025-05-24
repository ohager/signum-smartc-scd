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
import type { MachineData } from "./machine-data.ts";
import { Amount } from "@/components/ui/amount.tsx";
import { AdaptiveScrollArea } from "@/components/ui/adaptive-scroll-area.tsx";

export function DeploymentView({ data }: { data: MachineData }) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);

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

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Wallet Connection</CardTitle>
              <CardDescription>
                Connect to XT Wallet to deploy your contract
              </CardDescription>
            </CardHeader>
            <CardContent>
              {!isConnected ? (
                <div className="flex flex-col items-center justify-center py-6">
                  <Wallet className="h-12 w-12 text-blue-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">
                    Connect Your XT Wallet
                  </h3>
                  <p className="text-center text-muted-foreground mb-4 max-w-md">
                    To deploy your smart contract to the Signum blockchain, you
                    need to connect your XT Wallet.
                  </p>
                  <Button onClick={handleConnect} disabled={isConnecting}>
                    {isConnecting ? (
                      <>
                        <span className="animate-spin mr-2">⟳</span>
                        Connecting...
                      </>
                    ) : (
                      <>
                        <Wallet className="h-4 w-4 mr-2" />
                        Connect XT Wallet
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <div className="space-y-4">
                  <Alert className="bg-green-50 dark:bg-green-950 border-green-200 dark:border-green-900">
                    <Check className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <AlertTitle>Wallet Connected</AlertTitle>
                    <AlertDescription>
                      Your XT Wallet is connected and ready to deploy.
                    </AlertDescription>
                  </Alert>

                  <div className="p-4 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium">Account</h4>
                      <Badge variant="outline">Testnet</Badge>
                    </div>
                    <div className="font-mono text-sm mb-2">
                      S-ABCD-EFGH-IJKL-MNOP
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground text-sm">
                        Balance
                      </span>
                      <span className="font-medium">1,250.00 SIGNA</span>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open XT Wallet
              </Button>
              <Button disabled={!isConnected}>
                Deploy Contract
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </CardFooter>
          </Card>
        </div>
      </div>
    </AdaptiveScrollArea>
  );
}
