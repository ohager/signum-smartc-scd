import { Input } from "@/components/ui/input";
import { FieldLabel } from "@/components/ui/field-label";
import type { StepProps } from "./step-props";

export function StepPragmas({ updateData, data }: StepProps) {
  return (
    <div className="flex flex-col gap-y-4">
      <section>
        <FieldLabel
          text="Auxiliary Variables"
          tooltip="Used to tell compiler how many auxiliary variables will be available."
        />
        <div className="relative">
          <Input
            type="number"
            value={data.pragmas.maxAuxVars}
            onChange={(e) => {
              updateData("pragmas.maxAuxVars", Number(e.target.value));
            }}
            min={1}
            max={10}
            step={1}
          />
        </div>
      </section>
      <section>
        <FieldLabel
          text="Optimization Level"
          tooltip="Choose strategy for code optimizer. It can be between 0 (no optimization) and 3 (highest)."
        />
        <Input
          type="number"
          value={data.pragmas.optimizationLevel}
          onChange={(e) => {
            updateData("pragmas.optimizationLevel", Number(e.target.value));
          }}
          min={0}
          max={3}
          step={1}
        />
      </section>
    </div>
  );
}
