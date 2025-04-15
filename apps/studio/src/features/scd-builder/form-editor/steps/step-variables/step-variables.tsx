import { Button } from "@/components/ui/button";
import type { StepProps } from "../step-props";
import type { VariableDefinition } from "@signum-smartc-scd/core/parser";
import { useState } from "react";
import { PlusIcon } from "lucide-react";
import { VariableForm } from "./variable-form";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

export function StepVariables({ updateData, data, setCanProceed }: StepProps) {
  const [openItem, setOpenItem] = useState<string>("");

  const addNewVariable = () => {
    const newVariable: VariableDefinition = {
      type: "long",
      constant: false,
      initializable: false,
      name: "",
      description: "",
    };

    updateData("variables", [...(data.variables || []), newVariable]);
    setOpenItem(`item-${data.variables.length}`);
  };

  const updateVariable = (index: number, variable: VariableDefinition) => {
    const stateLayout = [...(data.variables || [])];
    stateLayout[index] = variable;
    updateData("variables", stateLayout);
  };

  const removeVariable = (index: number) => {
    const variables = [...(data.variables || [])];
    variables.splice(index, 1);
    updateData("variables", variables);
  };

  return (
    <div className="flex flex-col gap-y-4">
      <section>
        <div className="flex justify-end items-center mb-4">
          <Button variant="outline" onClick={addNewVariable}>
            <PlusIcon />
            New Variable
          </Button>
        </div>

        <div className="space-y-4">
          <Accordion
            type="single"
            collapsible
            className="w-full"
            value={openItem}
            onValueChange={setOpenItem}
          >
            {data.variables?.map((variable, index) => (
              <AccordionItem key={index} value={"item-" + index}>
                <AccordionTrigger>
                  Variable #{index + 1}{" "}
                  {variable.name ? ` - ${variable.name}` : ""}
                </AccordionTrigger>
                <AccordionContent>
                  <VariableForm
                    variable={variable}
                    onUpdate={(variable) => updateVariable(index, variable)}
                    onDelete={() => removeVariable(index)}
                  />
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </div>
  );
}
