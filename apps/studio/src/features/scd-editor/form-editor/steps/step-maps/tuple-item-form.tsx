import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import type {
  EnumTypeDefinition,
  MapItemDefinition,
} from "@signum-smartc-abi/core/parser";
import { toValidCName } from "@/lib/string";
import { DataTypeSelector } from "../data-type-selector";
import { Textarea } from "@/components/ui/textarea";
import { useMemo, useState } from "react";
import { VariableTypeOptions } from "../variable-type-options";
import { Checkbox } from "@/components/ui/checkbox";
import { EnumForm } from "./enum-form";
import { Button } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";

interface Props {
  item: MapItemDefinition;
  onChange: (updated: MapItemDefinition) => void;
}

const MaxEnums = 10;

export function TupleItemForm({ item, onChange }: Props) {
  const addEnum = () => {
    if (item.oneOf && item.oneOf.length >= MaxEnums) return;

    const newEnum: EnumTypeDefinition = {
      name: "",
      value: "",
    };
    onChange({
      ...item,
      oneOf: [...(item.oneOf || []), newEnum],
    });
  };

  const updateEnum = (index: number, updated: EnumTypeDefinition) => {
    const newEnum = [...(item.oneOf || [])];
    newEnum[index] = updated;
    onChange({ ...item, oneOf: newEnum });
  };

  const removeEnum = (index: number) => {
    const newEnum = [...(item.oneOf || [])];
    newEnum.splice(index, 1);
    onChange({ ...item, oneOf: newEnum });
  };

  const availableTypes = useMemo(() => {
    const nonArrayTypes = VariableTypeOptions.filter(
      (type) => !type.value.endsWith("[]"),
    );
    return item.constant
      ? nonArrayTypes
      : nonArrayTypes.concat({ value: "enum", label: "Enum" });
  }, [item.constant]);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-x-4 justify-start items-center">
        <div className="flex gap-x-2 justify-between ">
          <Checkbox
            checked={item.constant}
            onCheckedChange={(checked) =>
              onChange({ ...item, constant: Boolean(checked) })
            }
          />
          <FieldLabel
            text="Constant"
            tooltip="A constant value for the item."
          />
        </div>
      </div>
      <div>
        <FieldLabel text="Name" />
        <Input
          value={item.name}
          onChange={(e) => {
            const name = toValidCName(e.target.value).toUpperCase();
            onChange({ ...item, name });
          }}
          placeholder="Map Item Name"
        />
      </div>
      <div>
        <FieldLabel text="Description" />
        <Textarea
          value={item.description}
          onChange={(e) => {
            onChange({ ...item, description: e.target.value });
          }}
          placeholder="Map Item Description"
        />
      </div>
      {item.constant && (
        <div>
          <FieldLabel text="Value" />
          <Input
            value={item.value}
            onChange={(e) => {
              onChange({ ...item, value: e.target.value });
            }}
            placeholder="Constant Value"
          />
        </div>
      )}
      <div>
        <DataTypeSelector
          value={item.type}
          onValueChange={(type) => onChange({ ...item, type })}
          types={availableTypes}
        />
      </div>
      {item.type === "enum" && (
        <div className="p-2 border border-gray-100 rounded flex flex-col gap-y-2">
          <div className="flex justify-between items-center">
            <span>Enum Fields</span>
            <div className="flex gap-x-2 items-center">
              <small className="text-gray-400">{`${item.oneOf?.length || 0}/${MaxEnums}`}</small>
              <Button onClick={addEnum} variant="outline">
                <PlusIcon />
                New Enum
              </Button>
            </div>
          </div>
          {item.oneOf?.map((oneOf, index) => (
            <EnumForm
              key={`enum-${index}`}
              oneOf={oneOf}
              onChange={(updated) => updateEnum(index, updated)}
              onDelete={() => removeEnum(index)}
              withLabel={index === 0}
            />
          ))}
        </div>
      )}
    </div>
  );
}
