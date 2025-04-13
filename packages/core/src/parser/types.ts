export type DataType = Array<DataType> | String | Boolean;
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
  type: DataType;
  description?: string;
  initializable?: boolean;
  constant?: boolean;
  // for structs only
  fields?: Array<{
    name: string;
    type: DataType;
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
  code: string;
  args: {
    name: string;
    type: DataType;
  }[];
}

export interface ABIType {
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
  functions: FunctionDefinition[];
  stateLayout: VariableDefinition[];
  maps: MapDefinition[];
  transactions: TransactionDefinition[];
}
