import type { CompileVerdict, TestVerdict } from "@/lib/file-system";
import { t } from "@/i18n/runtime";

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
 *
 * The words come from `t()`: the locale is fixed for the page, so these stay
 * pure functions of their arguments within any one page load.
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
  if (verdict.errorCount === 0) return { fact: t("workflow.cells.compiles"), tone: "good" };

  return {
    fact: t("workflow.cells.errors", { count: verdict.errorCount }),
    tone: "bad",
  };
}

export function testCell(
  testFile: { modified: number } | null,
  verdict: TestVerdict | undefined,
  contractModified: number,
): CellContent {
  if (!testFile) return { fact: t("workflow.cells.noTests"), tone: "neutral" };
  if (!verdict) return UNKNOWN;
  if (verdict.sourceModified !== testFile.modified) return UNKNOWN;
  if (verdict.contractModified !== contractModified) return UNKNOWN;
  if (verdict.failed > 0)
    return { fact: t("workflow.cells.failed", { count: verdict.failed }), tone: "bad" };

  return { fact: t("workflow.cells.green", { count: verdict.passed }), tone: "good" };
}

export function simulateCell(scenarioCount: number): CellContent {
  if (scenarioCount === 0) return { fact: t("workflow.cells.noScenario"), tone: "neutral" };

  return {
    fact: t("workflow.cells.scenarios", { count: scenarioCount }),
    tone: "neutral",
  };
}

export type DeploymentAnswer =
  | { state: "no-wallet" }
  /** The source does not compile, so there is no code hash to ask about. */
  | { state: "no-code" }
  | { state: "asking" }
  /** Sent from this session, and not yet in a block the chain would list. */
  | { state: "deploying" }
  | { state: "answered"; total: number; mine: number; capped: boolean };

export function deployCell(answer: DeploymentAnswer): CellContent {
  if (answer.state === "no-wallet") {
    return { ...UNKNOWN, hint: t("workflow.cells.connectWallet") };
  }
  if (answer.state === "no-code") {
    return { ...UNKNOWN, hint: t("workflow.cells.notCompiling") };
  }
  if (answer.state === "asking") return { fact: "…", tone: "neutral" };
  if (answer.state === "deploying") {
    return {
      fact: t("workflow.cells.deploying"),
      tone: "neutral",
      hint: t("workflow.cells.waitingBlock"),
    };
  }
  if (answer.total === 0) return { fact: t("workflow.cells.notDeployed"), tone: "neutral" };

  const count = answer.capped ? "9+" : String(answer.total);
  if (answer.mine > 0)
    return { fact: t("workflow.cells.yours", { count, mine: answer.mine }), tone: "good" };

  return { fact: t("workflow.cells.deployed", { count }), tone: "neutral" };
}
