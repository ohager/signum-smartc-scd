import { buildLintContext } from "./lint-context";
import { pragmaVersion } from "./rules/pragma-version";
import { sendWithoutCheck } from "./rules/send-without-check";
import { senderCheck } from "./rules/sender-check";
import { switchNoDefault } from "./rules/switch-no-default";
import { unboundedLoop } from "./rules/unbounded-loop";
import type { LintFinding, Rule, RuleId } from "./types";
import type { SlotLabel } from "@/features/inspector/model/label-map";

export interface RuleEntry {
  id: RuleId;
  /** Needs the compiler's assembly, so it is skipped when the source does not compile. */
  needsAssembly: boolean;
  run: Rule;
}

/** The one list of rules; adding a rule means adding a line here. */
export const RULES: RuleEntry[] = [
  { id: "sender-check", needsAssembly: true, run: senderCheck },
  { id: "send-without-check", needsAssembly: true, run: sendWithoutCheck },
  { id: "unbounded-loop", needsAssembly: true, run: unboundedLoop },
  { id: "switch-no-default", needsAssembly: false, run: switchNoDefault },
  { id: "pragma-version", needsAssembly: false, run: pragmaVersion },
];

const byLineThenRule = (a: LintFinding, b: LintFinding) => a.line - b.line || a.rule.localeCompare(b.rule);

export function lintContract(
  source: string,
  opts: { params?: SlotLabel[] } = {},
): { compiled: boolean; findings: LintFinding[] } {
  const ctx = buildLintContext(source, opts);
  const compiled = ctx.verbose !== null;
  const findings = RULES.filter((r) => compiled || !r.needsAssembly).flatMap((r) => r.run(ctx));
  return { compiled, findings: findings.sort(byLineThenRule) };
}
