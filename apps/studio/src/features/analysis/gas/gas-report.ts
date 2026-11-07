import { SmartC } from "smartc-signum-compiler";
import { parseCompileError, type ParsedError } from "@/features/smartc-editor/language/compiler-symbols";
import { analyzeAssembly, type GasAnalysis } from "./analyzer";

/* 0.001 SIGNA per step = 100 000 planck; bigint keeps planck math exact. */
export const PLANCK_PER_STEP = 100_000n;

export interface GasReport {
  ok: true;
  analysis: GasAnalysis;
  activationAmountPlanck: bigint;
  activationLine: number | null;
  worstCaseSteps: number;
  worstCasePlanck: bigint;
  worstCase: { method: number | null; handler: string | null };
  /*
   * true when at least one method was decoded from a switch dispatcher, so
   * worstCaseSteps covers preamble + dispatch + handler (+ post-loop). false
   * (if/else dispatch, no reachable handlers): the tx-loop body is not modelled
   * and worstCaseSteps/worstCasePlanck are only a lower bound.
   */
  worstCaseComplete: boolean;
  activationTooLow: boolean;
  capHit: boolean;
}

const ActivationDirective = /^\s*#program\s+activationAmount\b/;

/*
 * The compiler already parses the amount (including `_` separators), so only
 * the directive's line is scanned for; it anchors editor diagnostics.
 */
function findActivationLine(source: string): number | null {
  const lines = source.split("\n");
  const idx = lines.findIndex((l) => ActivationDirective.test(l));
  return idx < 0 ? null : idx + 1;
}

export function gasReport(source: string, opts: { loopCap?: number } = {}): GasReport | { ok: false; error: ParsedError } {
  let analysis: GasAnalysis;
  let amount: string;
  try {
    const compiler = new SmartC({ language: "C", sourceCode: source });
    compiler.compile();
    amount = compiler.getMachineCode().PActivationAmount;
    analysis = analyzeAssembly(compiler.getAssemblyCode(), opts);
  } catch (e: any) {
    return { ok: false, error: parseCompileError(e?.message ?? "") };
  }

  const postSteps = analysis.postLoop?.maxSteps ?? 0;

  /*
   * Each tx is its own activation, so the worst case is the single costliest
   * dispatch+handler plus the post-loop code; without a switch dispatcher fall
   * back to the standalone handlers.
   */
  let worstSteps = 0;
  let worstCase: GasReport["worstCase"] = { method: null, handler: null };
  if (analysis.methods.length > 0) {
    for (const m of analysis.methods) {
      if (m.maxSteps >= worstSteps) {
        worstSteps = m.maxSteps;
        worstCase = { method: m.code, handler: m.handler };
      }
    }
  } else {
    for (const h of analysis.handlers) {
      if (h.maxSteps >= worstSteps) {
        worstSteps = h.maxSteps;
        worstCase = { method: null, handler: h.name ?? null };
      }
    }
  }
  const worstCaseSteps = worstSteps + postSteps;
  const worstCasePlanck = BigInt(worstCaseSteps) * PLANCK_PER_STEP;
  const activationAmountPlanck = BigInt(amount || "0");
  const rows = [...analysis.methods, ...analysis.handlers, ...(analysis.postLoop ? [analysis.postLoop] : [])];

  return {
    ok: true,
    analysis,
    activationAmountPlanck,
    activationLine: findActivationLine(source),
    worstCaseSteps,
    worstCasePlanck,
    worstCase,
    worstCaseComplete: analysis.methods.length > 0,
    activationTooLow: activationAmountPlanck < worstCasePlanck,
    capHit: rows.some((r) => r.capHit),
  };
}
