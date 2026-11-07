import { findOverwrittenParams } from "@/features/deployment/overwritten-params";
import type { LintFinding, Rule } from "../types";

/**
 * Rule 8: a deploy parameter is set at deployment, then the first activation
 * runs the top-level code. If that code writes the slot, the deployed value is
 * gone. Detection is shared with the deploy form's warning.
 */
export const overwrittenParam: Rule = (ctx) => {
  if (!ctx.verbose || ctx.params.length === 0) return [];
  const names = new Map(ctx.params.map((p) => [p.index, p.name]));
  return findOverwrittenParams(ctx.verbose.assembly, ctx.verbose.memory, ctx.params.map((p) => p.index)).map(
    ({ index, line }): LintFinding => ({
      rule: "overwritten-param",
      severity: "warning",
      line,
      message: `\`${names.get(index)}\` is a deploy parameter, but this line writes it before \`main\` runs, so the deployed value is replaced on first activation.`,
      data: { name: String(names.get(index)) },
      hint: "Drop the write, or only assign when the slot is still unset (`if (x == 0) { x = … }`) inside `main`.",
    }),
  );
};
