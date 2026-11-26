import { deployParamsFor } from "@/features/deployment/deploy-params";
import { buildLintContext } from "./lint-context";
import { activationBelowGas } from "./rules/activation-below-gas";
import { catchRecurringFault, noCatch } from "./rules/catch-handler";
import { overwrittenParam } from "./rules/overwritten-param";
import { pragmaVersion } from "./rules/pragma-version";
import { sendWithoutCheck } from "./rules/send-without-check";
import { senderCheck } from "./rules/sender-check";
import { switchNoDefault } from "./rules/switch-no-default";
import { unboundedLoop } from "./rules/unbounded-loop";
import type { LintFinding, Rule, RuleId } from "./types";
import type { SlotLabel } from "@/features/inspector/model/label-map";

export interface RuleEntry {
  id: RuleId;
  /**
   * Skipped when the source does not compile: the rule either reads the
   * assembly, or (rules 2 and 3) is source-only but would only add noise on
   * code the compiler rejects. The pragma and switch rules still run there.
   */
  requiresCompile: boolean;
  run: Rule;
}

/** The one list of rules; adding a rule means adding a line here. */
export const RULES: RuleEntry[] = [
  { id: "sender-check", requiresCompile: true, run: senderCheck },
  { id: "send-without-check", requiresCompile: true, run: sendWithoutCheck },
  { id: "unbounded-loop", requiresCompile: true, run: unboundedLoop },
  { id: "activation-below-gas", requiresCompile: true, run: activationBelowGas },
  { id: "no-catch", requiresCompile: true, run: noCatch },
  { id: "catch-recurring-fault", requiresCompile: true, run: catchRecurringFault },
  { id: "overwritten-param", requiresCompile: true, run: overwrittenParam },
  { id: "switch-no-default", requiresCompile: false, run: switchNoDefault },
  { id: "pragma-version", requiresCompile: false, run: pragmaVersion },
];

const byLineThenRule = (a: LintFinding, b: LintFinding) => a.line - b.line || a.rule.localeCompare(b.rule);

export function lintContract(
  source: string,
  opts: { params?: SlotLabel[] } = {},
): { compiled: boolean; findings: LintFinding[] } {
  // The TESTBED convention marks parameters even when no Label Map exists.
  const ctx = buildLintContext(source, { params: opts.params ?? deployParamsFor(source, []) });
  const compiled = ctx.verbose !== null;
  const findings = RULES.filter((r) => compiled || !r.requiresCompile).flatMap((r) => r.run(ctx));
  return { compiled, findings: findings.sort(byLineThenRule) };
}
