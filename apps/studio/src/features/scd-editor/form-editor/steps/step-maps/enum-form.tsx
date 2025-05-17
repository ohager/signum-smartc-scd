import { Button } from "@/components/ui/button";
import { FieldLabel } from "@/components/ui/field-label";
import { Input } from "@/components/ui/input";
import type { EnumTypeDefinition } from "@signum-smartc-abi/core/parser";
import { TrashIcon } from "lucide-react";

interface Props {
  oneOf: EnumTypeDefinition;
  onChange: (updated: EnumTypeDefinition) => void;
  onDelete: () => void;
  withLabel?: boolean;
}

export function EnumForm({
  oneOf,
  onChange,
  onDelete,
  withLabel = false,
}: Props) {
  return (
    <div className="flex gap-2 items-end">
      <div className="flex-1">
        {withLabel && <FieldLabel text="Name" />}
        <Input
          value={oneOf.name}
          onChange={(e) => onChange({ ...oneOf, name: e.target.value })}
          placeholder="Enum Name"
        />
      </div>
      <div className="flex-1">
        {withLabel && <FieldLabel text="Value" />}
        <Input
          value={oneOf.value}
          onChange={(e) => onChange({ ...oneOf, value: e.target.value })}
          placeholder="Enum Value"
        />
      </div>
      <Button variant="destructive" onClick={onDelete}>
        <TrashIcon />
      </Button>
    </div>
  );
}
