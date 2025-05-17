import { FieldLabel } from "@/components/ui/field-label";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select";
import type { DataType } from "@signum-smartc-scd/core/parser";
import { VariableTypeOptions } from "./variable-type-options";

export function DataTypeSelector({
  value,
  onValueChange,
  types = VariableTypeOptions,
}: {
  value: DataType | undefined;
  onValueChange: (value: DataType) => void;
  types?: typeof VariableTypeOptions;
}) {
  return (
    <>
      <FieldLabel text="Data Type" />
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select Data Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectGroup>
            <SelectLabel>Data type</SelectLabel>
            {types.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </>
  );
}
