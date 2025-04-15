import { Button } from "@/components/ui/button";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import { type TransactionDefinition } from "@signum-smartc-scd/core/parser";
import { PlusIcon } from "lucide-react";
import { useState } from "react";
import type { StepProps } from "../step-props";
import { TransactionForm } from "./transaction-form";

export function StepTransactions({
  updateData,
  data,
  setCanProceed,
}: StepProps) {
  const [openItem, setOpenItem] = useState<string>("");

  const addNewTransaction = () => {
    const newTransaction: TransactionDefinition = {
      name: "",
      description: "",
      kind: "sendAmount",
    };

    updateData("transactions", [...(data.transactions || []), newTransaction]);
    setOpenItem(`item-${data.transactions.length}`);
  };

  const updateTransaction = (
    index: number,
    transaction: TransactionDefinition,
  ) => {
    const transactions = [...(data.transactions || [])];
    transactions[index] = transaction;
    updateData("transactions", transactions);
  };

  const removeTransaction = (index: number) => {
    const transactions = [...(data.transactions || [])];
    transactions.splice(index, 1);
    updateData("transactions", transactions);
  };

  return (
    <div className="flex flex-col gap-y-4">
      <section>
        <div className="flex justify-end items-center mb-4">
          <Button variant="outline" onClick={addNewTransaction}>
            <PlusIcon />
            New Transaction
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
            {data.transactions?.map((transaction, index) => (
              <AccordionItem key={index} value={"item-" + index}>
                <AccordionTrigger>
                  Transaction #{index + 1}{" "}
                  {transaction.name ? ` - ${transaction.name}` : ""}
                </AccordionTrigger>
                <AccordionContent>
                  <TransactionForm
                    transaction={transaction}
                    onUpdate={(transaction) =>
                      updateTransaction(index, transaction)
                    }
                    onDelete={() => removeTransaction(index)}
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
