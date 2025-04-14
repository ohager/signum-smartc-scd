import type { DataType } from "@signum-smartc-abi/core/parser";

export const VariableTypeOptions: { value: DataType; label: string }[] = [
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
