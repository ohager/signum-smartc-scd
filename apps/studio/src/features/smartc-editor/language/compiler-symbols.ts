import { SmartC } from "smartc-signum-compiler";

export interface ParsedError {
  line: number;
  column: number;
  message: string;
}
export interface CompilerSymbols {
  variables: string[];
  labels: string[];
  warnings: string;
}
export interface CompileAnalysis {
  compiler: CompilerSymbols | null;
  error: ParsedError | null;
}

const SmartCErrorPattern =
  /At line: (?<line>\d+):(?<column>\d+)\.\s+(?<message>.*)/;

export function parseCompileError(message: string): ParsedError {
  const m = SmartCErrorPattern.exec(message ?? "");
  if (m?.groups) {
    return {
      line: parseInt(m.groups.line),
      column: parseInt(m.groups.column),
      message: m.groups.message,
    };
  }
  return { line: 1, column: 1, message: (message ?? "").trim() || "Compilation error" };
}

function isInternalName(name: string): boolean {
  return /^r\d+$/.test(name); // aux registers r0, r1, ...
}

export function analyzeWithCompiler(source: string): CompileAnalysis {
  try {
    const compiler = new SmartC({ language: "C", sourceCode: source });
    compiler.compile();
    const mc = compiler.getMachineCode();
    return {
      error: null,
      compiler: {
        variables: (mc.Memory ?? []).filter((n) => !isInternalName(n)),
        labels: (mc.Labels ?? []).map((l) => l.label).filter((name) => !name.startsWith("__")),
        warnings: mc.Warnings ?? "",
      },
    };
  } catch (e: any) {
    return { compiler: null, error: parseCompileError(e?.message ?? "") };
  }
}
