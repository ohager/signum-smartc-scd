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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Copy,
  Zap,
  AlertTriangle,
  Eye,
  EyeOff,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import { toast } from "sonner";
import type { Amount } from "@signumjs/util";
import { ExplorerLink } from "@/components/ui/explorer-link.tsx";
import { formatContractSize, calculateContractSize } from "./contract-size-helper";

/**
 * TEMPORARY COMPONENT FOR LARGE CONTRACT DEPLOYMENT
 *
 * This component handles deployment of contracts >8KiB using Form POST method.
 * This is a workaround until SignumJS and XT Wallet support POST body based signing.
 *
 * TODO: Remove this component once POST body signing is supported
 */

type DeploymentStep =
  | "idle"
  | "passphrase_input"
  | "submitting"
  | "success"
  | "error";

interface LargeContractDeploymentProps {
  data: MachineData;
  initialData: ContractData[];
  deadline: number;
  fee: Amount;
  nodeUrl: string;
}

export function LargeContractDeployment({
  data,
  deadline,
  fee,
  nodeUrl,
}: LargeContractDeploymentProps) {
  const [deploymentStep, setDeploymentStep] = useState<DeploymentStep>("idle");
  const [passphrase, setPassphrase] = useState("");
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [transactionId, setTransactionId] = useState("");
  const [errorMessage, setErrorMessage] = useState("");

  const contractSize = calculateContractSize(data);

  const handleStartDeployment = () => {
    setDeploymentStep("passphrase_input");
  };

  const handleDeploy = async () => {
    if (!passphrase.trim()) {
      toast.error("Please enter your passphrase");
      return;
    }

    try {
      setErrorMessage("");
      setDeploymentStep("submitting");

      // Prepare form data for POST request
      const formData = new URLSearchParams();
      formData.append("requestType", "createATProgram");
      formData.append("name", data.PName);
      formData.append("description", data.PDescription);
      formData.append("code", data.ByteCode);
      formData.append("data", data.ByteData);
      formData.append("dpages", data.DataPages.toString());
      formData.append("cspages", data.CodeStackPages.toString());
      formData.append("uspages", data.UserStackPages.toString());
      formData.append("minActivationAmountNQT", data.PActivationAmount);
      formData.append("secretPhrase", passphrase);
      formData.append("feeNQT", fee.getPlanck());
      formData.append("deadline", deadline.toString());
      formData.append("broadcast", "true");

      // Submit using Form POST
      const endpoint = `${nodeUrl}/api?requestType=createATProgram`;
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
      });

      const result = await response.json();

      if (result.errorCode || result.error) {
        throw new Error(
          result.errorDescription || result.error || "Deployment failed"
        );
      }

      if (!result.transaction) {
        throw new Error("No transaction ID returned from node");
      }

      setTransactionId(result.transaction);
      setDeploymentStep("success");

      // Clear passphrase from memory
      setPassphrase("");

      toast.success("Contract deployed successfully!");
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Failed to deploy contract"
      );
      setDeploymentStep("error");
      console.error("Large contract deployment failed:", error);
    }
  };

  const resetDeployment = () => {
    setDeploymentStep("idle");
    setTransactionId("");
    setErrorMessage("");
    setPassphrase("");
    setShowPassphrase(false);
  };

  const getStepProgress = () => {
    switch (deploymentStep) {
      case "idle":
        return 0;
      case "passphrase_input":
        return 25;
      case "submitting":
        return 75;
      case "success":
        return 100;
      case "error":
      default:
        return 0;
    }
  };

  const progress = getStepProgress();

  return (
    <div className="space-y-6">
      {/* Warning about large contract */}
      <Alert className="border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950">
        <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <AlertTitle className="text-amber-800 dark:text-amber-200">
          Large Contract Detected ({formatContractSize(contractSize)})
        </AlertTitle>
        <AlertDescription className="text-amber-700 dark:text-amber-300">
          This contract is too large (&gt;8KiB) for standard deployment. XT
          Wallet signing is not supported for large contracts. You must provide
          your passphrase for direct submission to the node.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg">
                Large Contract Deployment
              </CardTitle>
              <CardDescription>
                Deploy using Form POST method (passphrase required)
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

          {/* Passphrase Input */}
          {deploymentStep === "passphrase_input" && (
            <div className="space-y-4 mb-6">
              <Alert className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950">
                <AlertCircle className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-800 dark:text-blue-200">
                  Passphrase Required
                </AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-300">
                  Your passphrase will be used to sign the transaction directly.
                  It will not be stored and will be cleared from memory after
                  deployment.
                </AlertDescription>
              </Alert>

              <div className="space-y-2">
                <Label htmlFor="passphrase">Account Passphrase</Label>
                <div className="relative">
                  <Input
                    id="passphrase"
                    type={showPassphrase ? "text" : "password"}
                    value={passphrase}
                    onChange={(e) => setPassphrase(e.target.value)}
                    placeholder="Enter your 12-word passphrase"
                    className="pr-10"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        handleDeploy();
                      }
                    }}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-0 top-0 h-full px-3"
                    onClick={() => setShowPassphrase(!showPassphrase)}
                  >
                    {showPassphrase ? (
                      <EyeOff className="h-4 w-4" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Submitting */}
          {deploymentStep === "submitting" && (
            <Alert className="border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-950 mb-6">
              <Loader2 className="h-4 w-4 animate-spin text-blue-600 dark:text-blue-400" />
              <AlertTitle className="text-blue-800 dark:text-blue-200">
                Submitting Transaction
              </AlertTitle>
              <AlertDescription className="text-blue-700 dark:text-blue-300">
                Sending contract to the Signum node via Form POST...
              </AlertDescription>
            </Alert>
          )}

          {/* Error */}
          {deploymentStep === "error" && (
            <Alert className="border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 mb-6">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <AlertTitle className="text-red-800 dark:text-red-200">
                Deployment Failed
              </AlertTitle>
              <AlertDescription className="text-red-700 dark:text-red-300">
                {errorMessage}
              </AlertDescription>
            </Alert>
          )}

          {/* Success */}
          {deploymentStep === "success" && (
            <Alert className="border-green-200 dark:border-green-900 bg-green-50 dark:bg-green-950 mb-6">
              <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
              <AlertTitle className="text-green-800 dark:text-green-200">
                Deployment Successful!
              </AlertTitle>
              <AlertDescription className="text-green-700 dark:text-green-300">
                Your large smart contract has been deployed successfully.
                <div className="flex items-center gap-2 mt-2">
                  <span className="font-mono text-xs">{transactionId}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      navigator.clipboard.writeText(transactionId);
                      toast.success("Transaction ID copied!");
                    }}
                  >
                    <Copy className="h-3 w-3" />
                  </Button>
                  <ExplorerLink identifier={transactionId} type="tx">
                    <Button variant="ghost" size="icon" className="h-6 w-6">
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  </ExplorerLink>
                </div>
              </AlertDescription>
            </Alert>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            {deploymentStep === "idle" && (
              <Button onClick={handleStartDeployment} className="flex-1">
                <Zap className="h-4 w-4 mr-2" />
                Deploy Large Contract
              </Button>
            )}

            {deploymentStep === "passphrase_input" && (
              <>
                <Button
                  onClick={handleDeploy}
                  disabled={!passphrase.trim()}
                  className="flex-1"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Deploy Contract
                </Button>
                <Button variant="outline" onClick={resetDeployment}>
                  Cancel
                </Button>
              </>
            )}

            {deploymentStep === "submitting" && (
              <Button disabled className="flex-1">
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Submitting...
              </Button>
            )}

            {deploymentStep === "success" && (
              <Button variant="outline" onClick={resetDeployment}>
                Deploy Another
              </Button>
            )}

            {deploymentStep === "error" && (
              <Button variant="outline" onClick={resetDeployment}>
                Try Again
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
