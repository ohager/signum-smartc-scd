import type { CompileVerdict, TestVerdict } from "@/lib/file-system";

/**
 * What each cell of the workflow rail shows.
 *
 * All of it pure, because the interesting part is not the arrangement but the
 * staleness rule: a verdict is only shown while the files it was produced from
 * have not moved on. A green badge from before the last edit is the one way a
 * rail like this can actively mislead, so it is a rule with tests rather than
 * an intention.
 *
 * `errorCount` is 0 or 1 in practice — the SmartC compiler throws on the first
 * error rather than collecting, so `symbol-cache.ts` raises at most one marker
 * and `analyzeWithCompiler` returns at most one error. The plural branch is
 * kept anyway: it costs one ternary and it is the only thing that would need
 * writing if the compiler ever learns to recover.
 */

export type CellTone = "good" | "bad" | "neutral";

export interface CellContent {
  fact: string;
  tone: CellTone;
  /** Shown in the tooltip when the cell cannot answer. */
  hint?: string;
}

const UNKNOWN: CellContent = { fact: "—", tone: "neutral" };

export function compileCell(
  verdict: CompileVerdict | undefined,
  contractModified: number,
): CellContent {
  if (!verdict || verdict.sourceModified !== contractModified) return UNKNOWN;
  if (verdict.errorCount === 0) return { fact: "compiles", tone: "good" };

  return {
    fact: verdict.errorCount === 1 ? "1 error" : `${verdict.errorCount} errors`,
    tone: "bad",
  };
}

export function testCell(
  testFile: { modified: number } | null,
  verdict: TestVerdict | undefined,
  contractModified: number,
): CellContent {
  if (!testFile) return { fact: "no tests", tone: "neutral" };
  if (!verdict) return UNKNOWN;
  if (verdict.sourceModified !== testFile.modified) return UNKNOWN;
  if (verdict.contractModified !== contractModified) return UNKNOWN;
  if (verdict.failed > 0) return { fact: `${verdict.failed} failed`, tone: "bad" };

  return { fact: `${verdict.passed} green`, tone: "good" };
}

export function simulateCell(scenarioCount: number): CellContent {
  if (scenarioCount === 0) return { fact: "no scenario", tone: "neutral" };

  return {
    fact: scenarioCount === 1 ? "1 scenario" : `${scenarioCount} scenarios`,
    tone: "neutral",
  };
}

export type DeploymentAnswer =
  | { state: "no-wallet" }
  /** The source does not compile, so there is no code hash to ask about. */
  | { state: "no-code" }
  | { state: "asking" }
  | { state: "answered"; total: number; mine: number; capped: boolean };

export function deployCell(answer: DeploymentAnswer): CellContent {
  if (answer.state === "no-wallet") {
    return { ...UNKNOWN, hint: "Connect a wallet to ask the chain" };
  }
  if (answer.state === "no-code") {
    return { ...UNKNOWN, hint: "The contract does not compile yet" };
  }
  if (answer.state === "asking") return { fact: "…", tone: "neutral" };
  if (answer.total === 0) return { fact: "not deployed", tone: "neutral" };

  const count = answer.capped ? "9+" : String(answer.total);
  if (answer.mine > 0) return { fact: `${count} · ${answer.mine} yours`, tone: "good" };

  return { fact: `${count} deployed`, tone: "neutral" };
}
