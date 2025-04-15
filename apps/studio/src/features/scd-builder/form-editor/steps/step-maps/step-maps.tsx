import type { MapDefinition } from "@signum-smartc-scd/core/parser";
import type { StepProps } from "../step-props";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { PlusIcon } from "lucide-react";
import { TupleForm } from "./tuple-form";

export function StepMaps({ updateData, data, setCanProceed }: StepProps) {
  const [openItem, setOpenItem] = useState<string>("");

  const addNewMapTuple = () => {
    const newTuple: MapDefinition = {
      name: "",
      description: "",
      key1: {
        name: "",
        type: "string",
        description: "",
      },
      key2: {
        name: "",
        type: "string",
        description: "",
      },
      value: {
        name: "",
        type: "string",
        description: "",
      },
    };

    updateData("maps", [...(data.maps ?? []), newTuple]);
    setOpenItem(`item-${data.maps.length}`);
  };

  const updateMap = (index: number, map: MapDefinition) => {
    const maps = [...(data.maps || [])];
    maps[index] = map;
    updateData("maps", maps);
  };

  const removeMap = (index: number) => {
    const maps = [...(data.maps || [])];
    maps.splice(index, 1);
    updateData("maps", maps);
  };

  return (
    <div className="flex flex-col gap-y-4">
      <section>
        <div className="flex justify-end items-center mb-4">
          <Button variant="outline" onClick={addNewMapTuple}>
            <PlusIcon />
            New Tuple
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
            {data.maps?.map((map, index) => (
              <AccordionItem key={index} value={"item-" + index}>
                <AccordionTrigger>
                  Tuple #{index + 1} {map.name ? ` - ${map.name}` : ""}
                </AccordionTrigger>
                <AccordionContent>
                  <TupleForm
                    map={map}
                    onUpdate={(map) => updateMap(index, map)}
                    onDelete={() => removeMap(index)}
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
