import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { DataType, ValueDefinition } from "@signum-smartc-abi/core/parser";
import { TrashIcon } from "lucide-react";
import { VariableTypeOptions } from "../variable-type-options";

interface Props {
  arg: ValueDefinition;
  onChange: (updated: ValueDefinition) => void;
  onDelete: () => void;
  withLabel?: boolean;
}

export function MethodArgumentForm({
  arg,
  onChange,
  onDelete,
  withLabel = false,
}: Props) {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        {withLabel && <FieldLabel text="Name" />}
        <Input
          value={arg.name}
          onChange={(e) => onChange({ ...arg, name: e.target.value })}
          placeholder="Argument name"
        />
      </div>
      <div className="flex-1">
        {withLabel && <FieldLabel text="Type" />}
        <Select
          value={arg.type}
          onValueChange={(type) =>
            onChange({ ...arg, type: type as unknown as DataType })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select Data Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Data type</SelectLabel>
              {VariableTypeOptions.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
      <Button variant="destructive" onClick={onDelete}>
        <TrashIcon />
      </Button>
    </div>
  );
}
