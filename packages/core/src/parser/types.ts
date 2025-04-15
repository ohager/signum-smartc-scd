
export type DataType =
  | "address"
  | "string"
  | "boolean"
  | "long"
  | "amount"
  | "txId"
  | "address[]"
  | "string[]"
  | "boolean[]"
  | "long[]"
  | "amount[]"
  | "txId[]"
  | "struct"
  | "enum";

export type EnumTypeDefinition {
  name: string;
  value: string;
}

export type MapItemDefinition = {
  name: string;
  description?: string;
  type?: DataType;
  constant?: boolean;
  value?: string; // if constant
  oneOf?: EnumTypeDefinition[]; // if type === "enum"
};

export interface ValueDefinition {
  name: string;
  type: DataType;
}

export interface VariableDefinition extends ValueDefinition {
  description?: string;
  initializable?: boolean;
  constant?: boolean;
  // if constant and !initializable
  value?: string;
  // for structs only
  fields?: ValueDefinition[];
}

export interface MapDefinition {
  name: string;
  description?: string;
  key1: MapItemDefinition;
  key2: MapItemDefinition;
  value: MapItemDefinition;
}

export interface MethodDefinition {
  name: string;
  description?: string;
  code: string;
  args: ValueDefinition[];
}

export interface TransactionDefinition {
  name: string;
  description?: string;
  kind:
    | "sendAmountAndMessage"
    | "sendAmount"
    | "sendMessage"
    | "sendQuantity"
    | "sendQuantityAndAmount";
}

export interface SCDType {
  contractName: string;
  description?: string;
  activationAmount: string;
  pragmas: {
    maxAuxVars: number;
    verboseAssembly: boolean;
    optimizationLevel?: number;
    version: string;
    codeStackPages?: number;
    userStackPages?: number;
  };
  methods: MethodDefinition[];
  variables: VariableDefinition[];
  maps: MapDefinition[];
  transactions: TransactionDefinition[];
}
