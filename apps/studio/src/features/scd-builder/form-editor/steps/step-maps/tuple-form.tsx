import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type {
  MapDefinition,
  MapItemDefinition,
} from "@signum-smartc-abi/core/parser";
import { FieldLabel } from "@/components/ui/field-label";
import { TrashIcon } from "lucide-react";
import { toValidCName } from "@/lib/string";
import { TupleItemForm } from "./tuple-item-form";
import { Textarea } from "@/components/ui/textarea";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface Props {
  map: MapDefinition;
  onUpdate: (updated: MapDefinition) => void;
  onDelete: () => void;
}

export function TupleForm({ map, onUpdate, onDelete }: Props) {
  const [openItem, setOpenItem] = useState<string>("");

  return (
    <div className="border p-4 rounded-lg">
      <div className="flex justify-between mb-2">
        <h3 className="font-medium">
          Map Tuple Details{map.name ? ` - ${map.name}` : ""}
        </h3>
        <Button variant="destructive" onClick={onDelete}>
          <TrashIcon />
        </Button>
      </div>

      <section className="space-y-4">
        <div>
          <FieldLabel text="Name" />
          <Input
            value={map.name}
            onChange={(e) => {
              const name = toValidCName(e.target.value);
              onUpdate({ ...map, name });
            }}
            placeholder="Map name"
          />
        </div>

        <div>
          <FieldLabel text="Description" />
          <Textarea
            value={map.description}
            onChange={(e) => onUpdate({ ...map, description: e.target.value })}
            placeholder="Map description"
          />
        </div>

        <div>
          <Accordion
            type="single"
            collapsible
            className="w-full"
            value={openItem}
            onValueChange={setOpenItem}
          >
            {Object.entries({
              key1: map.key1,
              key2: map.key2,
              value: map.value,
            }).map(([k, item], index) => (
              <AccordionItem key={index} value={"tuple-item-" + index}>
                <AccordionTrigger>
                  {k.toUpperCase()} {item.name ? ` - ${item.name}` : ""}
                </AccordionTrigger>
                <AccordionContent>
                  <TupleItemForm
                    item={item}
                    onChange={(item) => onUpdate({ ...map, [k]: item })}
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
