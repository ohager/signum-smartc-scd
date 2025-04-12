export type DataType = Array<DataType> | String | Boolean | bigint;
export type MapType = {
  name: string;
  description?: string;
  type?: string;
  constant?: boolean;
  value?: DataType;
  oneOf?: Array<{
    name: string;
    value: string;
  }>;
};

export interface VariableDefinition {
  name: string;
  type: string;
  description?: string;
  initializable?: boolean;
  constant?: boolean;
  fields?: Array<{
    name: string;
    type: string;
  }>;
}

export interface MapDefinition {
  name: string;
  key1: MapType;
  key2: MapType;
  value: MapType;
}

export interface TransactionDefinition {
  name: string;
  kind:
    | "sendAmountAndMessage"
    | "sendBalance"
    | "sendQuantity"
    | "sendQuantityAndAmount";
  inputs: Array<{
    name: string;
    type: DataType;
  }>;
}

export interface FunctionDefinition {
  name: string;
  description?: string;
  code: bigint;
  args: {
    name: string;
    type: DataType;
  }[];
}

export interface ABIType {
  contractName: string;
  description?: string;
  activationAmount: bigint;
  pragmas: {
    maxAuxVars: number;
    verboseAssembly: boolean;
    optimizationLevel?: number;
    version: string;
    codeStackPages?: number;
    userStackPages?: number;
  };
  functions: FunctionDefinition[];
  stateLayout: VariableDefinition[];
  maps: MapDefinition[];
  transactions: TransactionDefinition[];
}
