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
  | "struct";

export type MapType = {
  name: string;
  description?: string;
  type?: DataType;
  constant?: boolean;
  value?: string;
  oneOf?: Array<{
    name: string;
    value: string;
  }>;
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
  key1: MapType;
  key2: MapType;
  value: MapType;
}

export interface MethodDefinition {
  name: string;
  description?: string;
  code: string;
  args: ValueDefinition[];
}

export interface TransactionDefinition {
  name: string;
  kind:
    | "sendAmountAndMessage"
    | "sendBalance"
    | "sendQuantity"
    | "sendQuantityAndAmount";
  inputs: ValueDefinition[];
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
