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

const ArgOptions: { value: DataType; label: string }[] = [
  { value: "address", label: "Account Address" },
  { value: "boolean", label: "Boolean" },
  { value: "string", label: "String" },
  { value: "long", label: "Long/Number" },
  { value: "amount", label: "Amount" },
  { value: "txId", label: "Transaction Id" },
  { value: "address[]", label: "Account Address - Array" },
  { value: "boolean[]", label: "Boolean - Array" },
  { value: "string[]", label: "String - Array" },
  { value: "long[]", label: "Long/Number - Array" },
  { value: "amount[]", label: "Amount - Array" },
  { value: "txId[]", label: "Transaction Id - Array" },
];

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
              {ArgOptions.map((option) => (
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
