import {
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { ABIType } from "@signum-smartc-abi/core/parser";
import { useForm } from "react-hook-form";
import { HelpCircleIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function ABIContractInfoSection() {
  const form = useForm<ABIType>();
  return (
    <AccordionItem value="contract-info">
      <AccordionTrigger>Contract Information</AccordionTrigger>
      <AccordionContent>
        <div className="flex flex-col gap-y-4">
          <FormField
            control={form.control}
            name="contractName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Contract Name</FormLabel>
                <FormControl>
                  <Input placeholder="Contract Name" {...field} />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="Write a description (mind that this can be SRC44 compliant also)"
                    maxLength={320}
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="activationAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="flex gap-x-1 items-center">
                  Activation Amount{" "}
                  <Tooltip>
                    <TooltipTrigger>
                      <HelpCircleIcon className="text-gray-400 h-3 w-3" />
                    </TooltipTrigger>
                    <TooltipContent>
                      This is the minimum amount required to activate/run the
                      contract.
                    </TooltipContent>
                  </Tooltip>
                </FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.1}
                    placeholder="Activation Amount"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
