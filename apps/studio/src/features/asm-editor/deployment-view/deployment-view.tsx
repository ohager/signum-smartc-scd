import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AlertCircle } from "lucide-react";
import { Amount } from "@signumjs/util";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { MachineData } from "../machine-data.ts";
import { Amount as AmountView } from "@/components/ui/amount.tsx";
import { AdaptiveScrollArea } from "@/components/ui/adaptive-scroll-area.tsx";
import { WalletConnection } from "./wallet-connection.tsx";
import { DeploymentFlow } from "./deployment-flow.tsx";
import { useState } from "react";
import { t } from "@/i18n/runtime";

export function DeploymentView({ data }: { data: MachineData }) {
  const [minimumFee, setMinimumFee] = useState(Amount.fromPlanck(data.MinimumFeeNQT).getSigna());
  const [deadline, setDeadline] = useState(1440);
  return (
    <AdaptiveScrollArea>
      <div className="max-w-3xl mx-auto">
        <h2 className="text-2xl font-bold">{t("asm-editor.deploy.title")}</h2>
        <Alert className="my-4">
          <AlertCircle className="h-4 w-4" color="red" />
          <AlertTitle>{t("asm-editor.deploy.noteTitle")}</AlertTitle>
          <AlertDescription>
            {t("asm-editor.deploy.note")}
          </AlertDescription>
        </Alert>
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("asm-editor.deploy.summary")}</CardTitle>
              <CardDescription>
                {t("asm-editor.deploy.summaryHint")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      {t("asm-editor.deploy.name")}
                    </h4>
                    <p className="font-medium">{data.PName}</p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      {t("asm-editor.deploy.activationAmount")}
                    </h4>
                    <p className="font-medium">
                      <AmountView amount={data.PActivationAmount} isAtomic />
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium text-muted-foreground mb-1">
                    {t("asm-editor.deploy.description")}
                  </h4>
                  <p>{data.PDescription}</p>
                </div>

                <Separator />

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      {t("asm-editor.deploy.codeSize")}
                    </h4>
                    <p className="font-medium">
                      {t("asm-editor.meta.bytes", { count: data.ByteCode.length / 2 })}
                    </p>
                  </div>
                  <div>
                    <h4 className="text-sm font-medium text-muted-foreground mb-1">
                      {t("asm-editor.deploy.minimumFee")}
                    </h4>
                    <p className="font-medium">
                      <AmountView amount={data.MinimumFeeNQT ?? 0} isAtomic />
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">{t("asm-editor.deploy.settings")}</CardTitle>
              <CardDescription>
                {t("asm-editor.deploy.settingsHint")}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="activation-amount">
                      {t("asm-editor.deploy.activationSigna")}
                    </Label>
                    <AmountView amount={data.PActivationAmount} isAtomic />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fee">{t("asm-editor.deploy.feeSigna")}</Label>
                    <Input
                      id="fee"
                      type="number"
                      step={0.1}
                      onChange={(e) => {
                        setMinimumFee(e.target.value);
                      }}
                      value={minimumFee}
                    />
                    <p className="text-xs text-muted-foreground">
                      {t("asm-editor.deploy.minimum")}{" "}
                      <AmountView amount={data.MinimumFeeNQT} isAtomic />
                    </p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="deadline">{t("asm-editor.deploy.deadline")}</Label>
                  <Input
                    id="deadline"
                    type="number"
                    onChange={(e) => {
                      setDeadline(Number(e.target.value));
                    }}
                    value={deadline}
                    max="1440"
                  />
                  <p className="text-xs text-muted-foreground">
                    {t("asm-editor.deploy.deadlineHint")}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <WalletConnection />
          <DeploymentFlow data={data} fee={Amount.fromSigna(minimumFee)} deadline={deadline} initialData={[]}/>
        </div>
      </div>
    </AdaptiveScrollArea>
  );
}
