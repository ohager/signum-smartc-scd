export type SmartCDecl = "long" | "fixed" | "void" | "struct";

export interface SmartCVariable {
  name: string;
  declaration: SmartCDecl;
  typeName?: string; // struct type name
  isPointer?: boolean;
  isArray?: boolean;
  line: number;
}
export interface SmartCMacro {
  name: string;
  params?: string[];
  value?: string;
  line: number;
}
export interface SmartCFunctionSymbol {
  name: string;
  returnType: string;
  params: { type: string; name: string }[];
  line: number;
}
export interface SmartCStruct {
  name: string;
  members: { name: string; declaration: string }[];
  line: number;
}
export interface SmartCLabel {
  name: string;
  line: number;
}
export interface SmartCConstant {
  name: string;
  value?: string;
  line: number;
}

export interface SmartCSymbols {
  variables: SmartCVariable[];
  macros: SmartCMacro[];
  functions: SmartCFunctionSymbol[];
  structs: SmartCStruct[];
  labels: SmartCLabel[];
  constants: SmartCConstant[];
}

export function emptySymbols(): SmartCSymbols {
  return { variables: [], macros: [], functions: [], structs: [], labels: [], constants: [] };
}
