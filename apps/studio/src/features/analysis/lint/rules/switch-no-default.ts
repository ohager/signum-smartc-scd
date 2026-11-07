import type { Rule } from "../types";

/** Rule 5: without `default`, a transaction with an unknown method is accepted and ignored without a trace. */
export const switchNoDefault: Rule = (ctx) =>
  ctx.switches
    .filter((sw) => !sw.hasDefault)
    .map((sw) => ({
      rule: "switch-no-default" as const,
      severity: "warning" as const,
      line: sw.line,
      message: "This `switch` has no `default:`, so unknown methods are accepted silently.", // i18n-ignore
      hint: "Add a `default:` that rejects or refunds, e.g. `default: sendAmount(currentTX.amount, currentTX.sender); break;`.",
    }));
