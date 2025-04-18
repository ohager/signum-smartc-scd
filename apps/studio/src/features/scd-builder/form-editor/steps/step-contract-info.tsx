import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FieldLabel } from "@/components/ui/field-label";
import { useEffect } from "react";
import type { StepProps } from "./step-props";
import { toValidCName } from "@/lib/string";
import { Amount } from "@signumjs/util";

const MaxNameLength = 32;
const MaxDescriptionLength = 320;

export function StepContractInfo({
  updateData,
  data,
  setCanProceed,
}: StepProps) {
  useEffect(() => {
    setCanProceed(data.contractName.length > 0);
  }, [data.contractName]);

  return (
    <div className="flex flex-col gap-y-4">
      <section>
        <FieldLabel text="Contract Name" />
        <div className="relative">
          <Input
            value={data.contractName}
            onChange={(e) => {
              const name = toValidCName(e.target.value);
              updateData("contractName", name);
              setCanProceed(name.length > 3);
            }}
            maxLength={MaxNameLength}
          />
          <small className="absolute text-xs text-gray-400 top-1 right-1">
            {data.contractName.length}/{MaxNameLength}
          </small>
        </div>
      </section>

      <section>
        <FieldLabel
          text="Brief Contract Description"
          tooltip="Could be a textual description or better an SRC44 compatible descriptor"
        />
        <div className="relative">
          <Textarea
            maxLength={MaxDescriptionLength}
            value={data.description ?? ""}
            onChange={(e) => updateData("description", e.target.value)}
          />
          <small className="absolute text-xs text-gray-400 top-1 right-1">
            {data.description?.length ?? 0}/{MaxDescriptionLength}
          </small>
        </div>
      </section>

      <section>
        <FieldLabel
          text="Activation Amount (SIGNA)"
          tooltip=" This is the minimum amount required to activate/run the
        contract. It should be more than the maximum execution
        costs."
        />
        <div className="relative">
          <Input
            type="number"
            value={
              data.activationAmount
                ? Amount.fromPlanck(data.activationAmount).getSigna()
                : ""
            }
            onChange={(e) => {
              const amount = e.target.value
                ? Amount.fromSigna(e.target.value).getPlanck()
                : "";
              updateData("activationAmount", amount);
            }}
            min={0.01}
            step={0.1}
          />
        </div>
      </section>
    </div>
  );
}
