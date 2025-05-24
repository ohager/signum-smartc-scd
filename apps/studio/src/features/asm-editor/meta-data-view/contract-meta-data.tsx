import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { InfoIcon } from "lucide-react";
import type { MachineData } from "@/features/asm-editor/machine-data.ts";
import { Amount } from "@/components/ui/amount.tsx";
import { Badge } from "@/components/ui/badge.tsx";

function NumberCard({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="p-2 rounded-md border-1">
      <h4 className="text-xs font-medium text-muted-foreground mb-1">
        {label}
      </h4>
      <p className="font-medium text-center">{value}</p>
    </div>
  );
}

function classifySize(size: number) {
  if (size < 1024) {
    return "tiny";
  }
  if (size < 1024 * 2) {
    return "small";
  }
  if (size < 1024 * 5) {
    return "medium";
  }
  if (size < 1024 * 10) {
    return "large";
  }
  return "huge";
}

export function ContractMetadata({ data }: { data: MachineData }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center">
          <InfoIcon className="h-4 w-4 mr-2 text-blue-500" />
          Contract Information
        </CardTitle>
        <CardDescription>Metadata and resource requirements</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">
                Name
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
                Hash ID
              </h4>
              <p className="font-mono">{data.MachineCodeHashId}</p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">
                Minimum Fee
              </h4>
              <p className="font-medium">
                <Amount amount={data.MinimumFeeNQT} isAtomic />
              </p>
            </div>
            <div>
              <h4 className="text-sm font-medium text-muted-foreground mb-1">
                Code Size
              </h4>
              <div className="flex items-center gap-x-2">
                <p className="font-medium">{data.ByteCode.length / 2} bytes</p>
                <Badge variant="outline">
                  {classifySize(data.ByteCode.length / 2)}
                </Badge>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-2">
            <NumberCard label="Data Pages" value={data.DataPages} />
            <NumberCard label="Code Pages" value={data.CodePages} />
            <NumberCard label="Code Stack" value={data.CodeStackPages} />
            <NumberCard label="User Stack" value={data.UserStackPages} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
