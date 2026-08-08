import type { CompilerSymbols } from "./compiler-symbols";

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

/** Merges scanner symbols with authoritative compiler symbols (variables/labels). */
export function mergeSymbols(
  scanned: SmartCSymbols,
  compiler: CompilerSymbols | null,
): SmartCSymbols {
  if (!compiler) return scanned;
  const known = new Set(scanned.variables.map((v) => v.name));
  const extraVars: SmartCVariable[] = compiler.variables
    .filter((name) => !known.has(name))
    .map((name) => ({ name, declaration: "long" as const, line: 0 }));
  const knownLabels = new Set(scanned.labels.map((l) => l.name));
  const extraLabels = compiler.labels
    .filter((name) => !knownLabels.has(name))
    .map((name) => ({ name, line: 0 }));
  return {
    ...scanned,
    variables: [...scanned.variables, ...extraVars],
    labels: [...scanned.labels, ...extraLabels],
  };
}
