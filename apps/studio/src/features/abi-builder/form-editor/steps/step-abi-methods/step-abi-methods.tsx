import type { MethodDefinition } from "@signum-smartc-abi/core/parser";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { MethodForm } from "./method-form";
import type { StepProps } from "../step-props";

export function StepABIMethods({ updateData, data, setCanProceed }: StepProps) {
  const addNewMethod = () => {
    const newMethod: MethodDefinition = {
      code: (data.methods.length + 1).toString(10),
      name: "",
      description: "",
      args: [],
    };

    updateData("methods", [...(data.methods || []), newMethod]);
  };

  const updateMethod = (index: number, method: MethodDefinition) => {
    const methods = [...(data.methods || [])];
    methods[index] = method;
    updateData("methods", methods);
  };

  const removeMethods = (index: number) => {
    const functions = [...(data.methods || [])];
    functions.splice(index, 1);
    updateData("methods", functions);
  };

  return (
    <div className="flex flex-col gap-y-4">
      <section>
        <div className="flex justify-end items-center mb-4">
          <Button variant="outline" onClick={addNewMethod}>
            <PlusIcon /> New Method
          </Button>
        </div>

        <div className="space-y-4">
          {data.methods?.map((method, index) => (
            <MethodForm
              key={index}
              method={method}
              onUpdate={(method) => updateMethod(index, method)}
              onDelete={() => removeMethods(index)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
