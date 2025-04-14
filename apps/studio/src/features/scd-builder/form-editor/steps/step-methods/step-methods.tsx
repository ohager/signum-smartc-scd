import type { MethodDefinition } from "@signum-smartc-scd/core/parser";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { MethodForm } from "./method-form";
import type { StepProps } from "../step-props";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { useState } from "react";

export function StepMethods({ updateData, data, setCanProceed }: StepProps) {
  const [openItem, setOpenItem] = useState<string>("");

  const addNewMethod = () => {
    const newMethod: MethodDefinition = {
      code: (data.methods.length + 1).toString(10),
      name: "",
      description: "",
      args: [],
    };

    updateData("methods", [...(data.methods || []), newMethod]);
    setOpenItem(`item-${data.methods.length}`);
  };

  const updateMethod = (index: number, method: MethodDefinition) => {
    const methods = [...(data.methods || [])];
    methods[index] = method;
    updateData("methods", methods);
  };

  const removeMethods = (index: number) => {
    const methods = [...(data.methods || [])];
    methods.splice(index, 1);
    updateData("methods", methods);
  };

  return (
    <div className="flex flex-col gap-y-4">
      <section>
        <div className="flex justify-end items-center mb-4">
          <Button variant="outline" onClick={addNewMethod}>
            <PlusIcon />
            New Method
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
            {data.methods?.map((method, index) => (
              <AccordionItem key={index} value={"item-" + index}>
                <AccordionTrigger>
                  Method #{index + 1} {method.name ? ` - ${method.name}` : ""}
                </AccordionTrigger>
                <AccordionContent>
                  <MethodForm
                    key={index}
                    method={method}
                    onUpdate={(method) => updateMethod(index, method)}
                    onDelete={() => removeMethods(index)}
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
