import { gasReport } from "../../gas/gas-report";
import type { LintFinding, Rule } from "../types";

/**
 * Rule 4: the activation amount must pay for the costliest handler. A call
 * that runs out of gas is a fatal fault, so this is the one error-level rule.
 * The numbers come from the gas analyzer; nothing is recomputed here.
 */

const PLANCK_PER_SIGNA = 100_000_000n;
/** The amount to recommend is rounded up to 0.01 SIGNA. */
const ROUNDING_PLANCK = 1_000_000n;

function formatSigna(planck: bigint): string {
  const whole = planck / PLANCK_PER_SIGNA;
  const fraction = (planck % PLANCK_PER_SIGNA).toString().padStart(8, "0").replace(/0+$/, "").padEnd(2, "0");
  return `${whole}.${fraction}`;
}

const roundUp = (planck: bigint) => ((planck + ROUNDING_PLANCK - 1n) / ROUNDING_PLANCK) * ROUNDING_PLANCK;

export const activationBelowGas: Rule = (ctx) => {
  const report = gasReport(ctx.source);
  if (!report.ok || !report.activationTooLow) return [];

  const required = roundUp(report.worstCasePlanck);
  const where = report.worstCase.handler ? ` (handler \`${report.worstCase.handler}\`${report.worstCase.method === null ? "" : `, method ${report.worstCase.method}`})` : "";
  const cost = `${report.worstCaseComplete ? "" : "at least "}${formatSigna(report.worstCasePlanck)} SIGNA${where}`;
  const hasDirective = report.activationLine !== null;

  const hints = [`Set \`#program activationAmount ${required}\` (${formatSigna(required)} SIGNA, the worst case rounded up to 0.01 SIGNA).`];
  if (report.capHit) hints.push(`Loops were assumed to run ${report.analysis.loopCap} times; a loop that runs longer costs more.`);
  if (!report.worstCaseComplete) {
    hints.push("The contract has no `switch` dispatcher, so the analysis could not follow every path and the real maximum may be higher.");
  }

  const finding: LintFinding = {
    rule: "activation-below-gas",
    severity: "error",
    line: report.activationLine ?? 1,
    message: hasDirective
      ? `The worst case costs ${cost}, but activationAmount is ${formatSigna(report.activationAmountPlanck)} SIGNA.`
      : `No activationAmount set; the worst case costs ${cost}.`,
    hint: hints.join(" "),
  };
  return [finding];
};
