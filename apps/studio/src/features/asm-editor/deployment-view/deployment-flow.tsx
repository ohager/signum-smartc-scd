import { useState } from "react";
import type { ContractData } from "@signumjs/contracts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  Wallet,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Copy,
  Clock,
  Zap,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useWalletStatus } from "@/hooks/use-wallet-status.ts";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import { toast } from "sonner";
import { wallet } from "@/lib/wallet.ts";
import type { ConfirmedTransaction } from "@signumjs/wallets";
import type { Amount } from "@signumjs/util";
import { ExplorerLink } from "@/components/ui/explorer-link.tsx";
import type { Ledger } from "@signumjs/core";
import { HttpError } from "@signumjs/http";

async function waitForBroadcastedTx(
  txId: string,
  ledger: Ledger,
  timeout = 30,
) {
  const { unconfirmedTransactions } =
    await ledger.transaction.getUnconfirmedTransactions();
  if (unconfirmedTransactions.find((t) => t.transaction === txId)) {
    return;
  }
  if (timeout === 0) {
    throw new Error(
      `Transaction ${txId} not found in unconfirmed transactions after ${timeout} seconds`,
    );
  }
  await new Promise((resolve) => setTimeout(resolve, 1000));
  await waitForBroadcastedTx(txId, ledger, timeout - 1);
}

type DeploymentStep =
  | "idle"
  | "preparing"
  | "wallet_confirmation"
  | "broadcasting"
  | "success"
  | "error";

interface DeploymentFlowProps {
  data: MachineData;
  initialData: ContractData[];
  deadline: number;
  fee: Amount;
}

export function DeploymentFlow({
  data,
  initialData,
  deadline,
  fee,
}: DeploymentFlowProps) {
  const [deploymentStep, setDeploymentStep] = useState<DeploymentStep>("idle");
  const [deploymentTransaction, setDeploymentTransaction] =
    useState<ConfirmedTransaction | null>(null);
  const [unsignedBytes, setUnsignedBytes] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const status = useWalletStatus();

  const handleDeploy = async () => {
    if (!status) {
      toast.warning("Please connect to a wallet to deploy your contract");
      return;
    }
    try {
      setErrorMessage("");
      setDeploymentStep("preparing");
      const unsignedTx = await status.ledger.contract.publishContract({
        data: initialData,
        codeHex: data.ByteCode,
        description: data.PDescription,
        name: data.PName,
        deadline,
        activationAmountPlanck: data.PActivationAmount,
        senderPublicKey: status.publicKey,
        dataPages: data.DataPages,
        feePlanck: fee.getPlanck(),
      });

      setDeploymentStep("wallet_confirmation");
      setUnsignedBytes(unsignedTx.unsignedTransactionBytes);
      const tx = await wallet.signTransaction(
        unsignedTx.unsignedTransactionBytes,
      );

      setDeploymentStep("broadcasting");
      await waitForBroadcastedTx(tx.transactionId, status.ledger);

      setDeploymentStep("success");
      setDeploymentTransaction(tx);
    } catch (error) {
      setErrorMessage(
        error instanceof HttpError
          ? `${error.message}. Please try again.`
          : "Failed to deploy contract. Please try again.",
      );
      setDeploymentStep("error");
      console.error("Deployment failed:", error);
    }
  };

  const getStepProgress = () => {
    switch (deploymentStep) {
      case "idle":
        return 0;
      case "preparing":
        return 25;
      case "wallet_confirmation":
        return 50;
      case "broadcasting":
        return 75;
      case "success":
        return 100;
      case "error":
      default:
        return 0;
    }
  };

  const resetDeployment = () => {
    setDeploymentStep("idle");
    setDeploymentTransaction(null);
    setUnsignedBytes("");
    setErrorMessage("");
  };

  const progress = getStepProgress();
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">Contract Deployment</CardTitle>
              <CardDescription>
                Deploy your smart contract to the Signum blockchain
              </CardDescription>
            </div>
            {deploymentStep !== "idle" && deploymentStep !== "error" && (
              <Badge variant="outline" className="animate-pulse">
                In Progress
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {deploymentStep !== "idle" && deploymentStep !== "error" && (
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium">Deployment Progress</span>
                <span className="text-sm text-muted-foreground">
                  {progress}%
                </span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          <DeploymentSteps
            currentStep={deploymentStep}
            unsignedBytes={unsignedBytes}
            transaction={deploymentTransaction}
            errorMessage={errorMessage}
          />

          <div className="flex gap-3 mt-6">
            {status === null ? (
              <div className="flex items-center gap-2 w-full justify-center text-gray-400">
                Connect Wallet First
              </div>
            ) : (
              <Button
                onClick={handleDeploy}
                disabled={
                  deploymentStep !== "idle" && deploymentStep !== "error"
                }
                className="flex-1"
              >
                { progress === 0 && (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Deploy Contract
                  </>
                )}
                {progress === 100 && (
                  <>
                  <CheckCircle className="h-4 w-4 mr-2" />
                    Deployed!
                  </>
                )}
                {progress > 0 && progress < 100 && (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Broadcasting...
                  </>
                )}
              </Button>
            )}

            {(deploymentStep === "error" || deploymentStep === "success") && (
              <Button variant="outline" onClick={resetDeployment}>
                Reset
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DeploymentSteps({
  currentStep,
  unsignedBytes,
  transaction,
  errorMessage,
}: {
  currentStep: DeploymentStep;
  unsignedBytes: string;
  transaction: ConfirmedTransaction | null;
  errorMessage: string;
}) {
  const steps = [
    {
      id: "preparing",
      title: "Preparing Transaction",
      description: "Getting unsigned bytes from Signum ledger",
      icon: <Clock className="h-4 w-4" />,
    },
    {
      id: "wallet_confirmation",
      title: "Wallet Confirmation",
      description: "Waiting for XT Wallet confirmation",
      icon: <Wallet className="h-4 w-4" />,
    },
    {
      id: "broadcasting",
      title: "Broadcasting",
      description: "Submitting transaction to the network",
      icon: <Zap className="h-4 w-4" />,
    },
    {
      id: "success",
      title: "Deployed",
      description: "Contract successfully deployed",
      icon: <CheckCircle className="h-4 w-4" />,
    },
  ];

  const getStepStatus = (stepId: string) => {
    if (currentStep === "error") return "error";
    if (currentStep === "idle") return "pending";

    const stepOrder = [
      "preparing",
      "wallet_confirmation",
      "broadcasting",
      "success",
    ];
    const currentIndex = stepOrder.indexOf(currentStep);
    const stepIndex = stepOrder.indexOf(stepId);

    if (stepIndex === stepOrder.length - 1 && currentStep === "success")
      return "completed";
    if (stepIndex < currentIndex) return "completed";
    if (stepIndex === currentIndex) return "active";
    return "pending";
  };

  const getStepIcon = (step: any, status: string) => {
    if (status === "completed")
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    if (status === "active")
      return <Loader2 className="h-4 w-4 animate-spin text-blue-500" />;
    if (status === "error")
      return <AlertCircle className="h-4 w-4 text-red-500" />;
    return <div className="h-4 w-4 rounded-full border-2 border-gray-300" />;
  };

  return (
    <div className="space-y-4">
      {currentStep === "error" && (
        <Alert className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950">
          <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
          <AlertTitle className="text-red-800 dark:text-red-200">
            Deployment Failed
          </AlertTitle>
          <AlertDescription className="text-red-700 dark:text-red-300">
            {errorMessage}
          </AlertDescription>
        </Alert>
      )}

      {currentStep === "success" && (
        <Alert className="border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950">
          <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
          <AlertTitle className="text-green-800 dark:text-green-200">
            Deployment Successful!
          </AlertTitle>
          <AlertDescription className="text-green-700 dark:text-green-300">
            Your smart contract has been deployed successfully.
            <div className="flex items-center gap-2 mt-2">
              <span className="font-mono text-xs">
                {transaction?.transactionId}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6">
                <Copy className="h-3 w-3" />
              </Button>
              {transaction && (
                <ExplorerLink
                  identifier={transaction?.transactionId ?? ""}
                  type="tx"
                >
                  <Button variant="ghost" size="icon" className="h-6 w-6">
                    <ExternalLink className="h-3 w-3" />
                  </Button>
                </ExplorerLink>
              )}
            </div>
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-3">
        {steps.map((step, index) => {
          const status = getStepStatus(step.id);
          return (
            <div key={step.id} className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                {getStepIcon(step, status)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h4
                    className={`text-sm font-medium ${
                      status === "completed"
                        ? "text-green-700 dark:text-green-300"
                        : status === "active"
                          ? "text-blue-700 dark:text-blue-300"
                          : status === "error"
                            ? "text-red-700 dark:text-red-300"
                            : "text-gray-500"
                    }`}
                  >
                    {step.title}
                  </h4>
                  {status === "active" && step.id === "wallet_confirmation" && (
                    <Badge variant="outline" className="text-xs animate-pulse">
                      Check XT Wallet
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {step.description}
                </p>

                {/* Show unsigned bytes when preparing is complete */}
                {step.id === "preparing" &&
                  status === "completed" &&
                  unsignedBytes && (
                    <div className="mt-2 p-2 bg-slate-100 dark:bg-slate-900 rounded text-xs font-mono">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-muted-foreground">
                          Unsigned Bytes:
                        </span>
                        <Button variant="ghost" size="icon" className="h-5 w-5">
                          <Copy className="h-3 w-3" />
                        </Button>
                      </div>
                      <div className="truncate">{unsignedBytes}</div>
                    </div>
                  )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Special message for wallet confirmation step */}
      {currentStep === "wallet_confirmation" && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
          <div className="flex items-center gap-2 mb-2">
            <Wallet className="h-4 w-4 text-blue-600 dark:text-blue-400" />
            <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
              XT Wallet Action Required
            </span>
          </div>
          <p className="text-xs text-blue-700 dark:text-blue-300">
            Please check your XT Wallet extension. A confirmation dialog should
            have opened. Review the transaction details and confirm to proceed
            with the deployment.
          </p>
        </div>
      )}
    </div>
  );
}
