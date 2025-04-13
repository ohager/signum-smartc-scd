import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type {
  MethodDefinition,
  ValueDefinition,
} from "@signum-smartc-abi/core/parser";
import { MethodCodeInput } from "./method-code-input";
import { MethodArgumentForm } from "./method-args-form";
import { FieldLabel } from "@/components/ui/field-label";
import { PlusIcon, TrashIcon } from "lucide-react";
interface Props {
  method: MethodDefinition;
  onUpdate: (updated: MethodDefinition) => void;
  onDelete: () => void;
}

export function MethodForm({ method, onUpdate, onDelete }: Props) {
  const addArgument = () => {
    const newArg: ValueDefinition = {
      name: "",
      type: "long",
    };
    onUpdate({
      ...method,
      args: [...(method.args || []), newArg],
    });
  };

  const updateArgument = (index: number, updated: ValueDefinition) => {
    const newArgs = [...(method.args || [])];
    newArgs[index] = updated;
    onUpdate({ ...method, args: newArgs });
  };

  const removeArgument = (index: number) => {
    const newArgs = [...(method.args || [])];
    newArgs.splice(index, 1);
    onUpdate({ ...method, args: newArgs });
  };

  return (
    <div className="border p-4 rounded-lg">
      <div className="flex justify-between mb-2">
        <h3 className="font-medium">Method Details</h3>
        <Button variant="destructive" onClick={onDelete}>
          <TrashIcon />
        </Button>
      </div>

      <section className="space-y-4">
        <div>
          <FieldLabel text="Name" />
          <Input
            value={method.name}
            onChange={(e) => onUpdate({ ...method, name: e.target.value })}
            placeholder="Method name"
          />
        </div>

        <div>
          <FieldLabel text="Description" />
          <Input
            value={method.description}
            onChange={(e) =>
              onUpdate({ ...method, description: e.target.value })
            }
            placeholder="Method description"
          />
        </div>

        <MethodCodeInput
          code={method.code || ""}
          onChange={(code) => onUpdate({ ...method, code })}
        />
      </section>
      <hr className="my-4" />
      <section className="space-y-4">
        <div className="flex justify-between items-center">
          Arguments
          <Button onClick={addArgument} variant="outline">
            <PlusIcon />
            Add Argument
          </Button>
        </div>

        {method.args?.map((arg, index) => (
          <MethodArgumentForm
            key={index}
            arg={arg}
            onChange={(updated) => updateArgument(index, updated)}
            onDelete={() => removeArgument(index)}
            withLabel={index === 0}
          />
        ))}
      </section>
    </div>
  );
}
