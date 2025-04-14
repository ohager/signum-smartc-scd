import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type {
  DataType,
  ValueDefinition,
  VariableDefinition,
} from "@signum-smartc-abi/core/parser";
import { FieldLabel } from "@/components/ui/field-label";
import { TrashIcon, PlusIcon } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select";
import { VariableTypeOptions } from "../variable-type-options";
import { StructFieldForm } from "./struct-field-form";
import { toValidCName } from "@/lib/string";
import { Checkbox } from "@/components/ui/checkbox";
import { useMemo } from "react";

interface Props {
  variable: VariableDefinition;
  onUpdate: (updated: VariableDefinition) => void;
  onDelete: () => void;
}

export function VariableForm({ variable, onUpdate, onDelete }: Props) {
  const addField = () => {
    const newField: ValueDefinition = {
      name: "",
      type: "long",
    };
    onUpdate({
      ...variable,
      fields: [...(variable.fields || []), newField],
    });
  };

  const updateField = (index: number, updated: ValueDefinition) => {
    const newFields = [...(variable.fields || [])];
    newFields[index] = updated;
    onUpdate({ ...variable, fields: newFields });
  };

  const removeField = (index: number) => {
    const newArgs = [...(variable.fields || [])];
    newArgs.splice(index, 1);
    onUpdate({ ...variable, fields: newArgs });
  };

  const availableTypes = useMemo(() => {
    return variable.constant
      ? VariableTypeOptions
      : [...VariableTypeOptions, { value: "struct", label: "Struct" }];
  }, [variable.constant]);

  return (
    <div className="border p-4 rounded-lg">
      <div className="flex justify-between mb-2">
        <h3 className="font-medium">
          Variable Details{variable.name ? ` - ${variable.name}` : ""}
        </h3>
        <Button variant="destructive" onClick={onDelete}>
          <TrashIcon />
        </Button>
      </div>

      <section className="space-y-4">
        <div className="flex gap-x-4 justify-start items-center">
          <div className="flex gap-x-2 justify-between ">
            <Checkbox
              checked={variable.constant}
              onCheckedChange={(checked) =>
                onUpdate({ ...variable, constant: Boolean(checked) })
              }
            />
            <FieldLabel
              text="Constant"
              tooltip="A constant variable cannot be changed after initialization"
            />
          </div>
          <div className="flex gap-x-2 justify-between">
            <Checkbox
              checked={variable.initializable}
              onCheckedChange={(checked) =>
                onUpdate({ ...variable, initializable: Boolean(checked) })
              }
            />
            <FieldLabel
              text="Is Initializable"
              tooltip="The variable can be initialized on the contract's creation"
            />
          </div>
        </div>
        <div>
          <FieldLabel text="Name" />
          <Input
            value={variable.name}
            onChange={(e) => {
              const name = toValidCName(e.target.value);
              onUpdate({ ...variable, name });
            }}
            placeholder="Variable name"
          />
        </div>

        <div>
          <FieldLabel text="Description" />
          <Input
            value={variable.description}
            onChange={(e) =>
              onUpdate({ ...variable, description: e.target.value })
            }
            placeholder="Variable description"
          />
        </div>
        <div>
          <FieldLabel text="Data Type" />
          <Select
            value={variable.type}
            onValueChange={(type) =>
              onUpdate({ ...variable, type: type as unknown as DataType })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Data Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Data type</SelectLabel>
                {availableTypes.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>

        {variable.constant && !variable.initializable && (
          <div>
            <FieldLabel text="Constant Value" />
            <Input
              value={variable.value}
              onChange={(e) => onUpdate({ ...variable, value: e.target.value })}
              placeholder="Enter a value for the constant"
            />
          </div>
        )}
      </section>
      {variable.type === "struct" && (
        <>
          <hr className="my-4" />
          <section className="space-y-4">
            <div className="flex justify-between items-center">
              Struct Fields
              <Button onClick={addField} variant="outline">
                <PlusIcon />
                New Field
              </Button>
            </div>

            {variable.fields?.map((field, index) => (
              <StructFieldForm
                key={index}
                field={field}
                onChange={(updated) => updateField(index, updated)}
                onDelete={() => removeField(index)}
                withLabel={index === 0}
              />
            ))}
          </section>
        </>
      )}
    </div>
  );
}
