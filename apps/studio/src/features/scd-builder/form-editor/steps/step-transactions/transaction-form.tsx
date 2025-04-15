import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { TransactionDefinition } from "@signum-smartc-abi/core/parser";
import { FieldLabel } from "@/components/ui/field-label";
import { TrashIcon } from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "@/components/ui/select";
import { toValidCName } from "@/lib/string";

interface Props {
  transaction: TransactionDefinition;
  onUpdate: (updated: TransactionDefinition) => void;
  onDelete: () => void;
}

const transactionKindOptions = [
  { value: "sendAmount", label: "Send Signa" },
  { value: "sendAmountAndMessage", label: "Send Signa and Message" },
  { value: "sendMessage", label: "Send Message" },
  { value: "sendQuantity", label: "Send Token" },
  { value: "sendQuantityAndAmount", label: "Send Token and Signa" },
];

export function TransactionForm({ transaction, onUpdate, onDelete }: Props) {
  return (
    <div className="border p-4 rounded-lg">
      <div className="flex justify-between mb-2">
        <h3 className="font-medium">
          Transaction Details{transaction.name ? ` - ${transaction.name}` : ""}
        </h3>
        <Button variant="destructive" onClick={onDelete}>
          <TrashIcon />
        </Button>
      </div>

      <section className="space-y-4">
        <div>
          <FieldLabel text="Name" />
          <Input
            value={transaction.name}
            onChange={(e) => {
              const name = toValidCName(e.target.value);
              onUpdate({ ...transaction, name });
            }}
            placeholder="Transaction name"
          />
        </div>

        <div>
          <FieldLabel text="Description" />
          <Input
            value={transaction.description}
            onChange={(e) =>
              onUpdate({ ...transaction, description: e.target.value })
            }
            placeholder="Transaction description"
          />
        </div>

        <div>
          <FieldLabel
            text="Transaction Type"
            tooltip="Determine what kind of transactions the contract dispatches."
          />
          <Select
            value={transaction.kind}
            onValueChange={(kind) =>
              onUpdate({
                ...transaction,
                kind: kind as TransactionDefinition["kind"],
              })
            }
          >
            <SelectTrigger>
              <SelectValue placeholder="Select Transaction Type" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectLabel>Transaction Type</SelectLabel>
                {transactionKindOptions.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </section>
    </div>
  );
}
