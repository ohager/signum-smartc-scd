import { lineAt, matchingClose } from "../source-structure";
import type { LintFinding, Rule } from "../types";

/**
 * Rule 2: sending funds should follow a look at the balance or the amount.
 * Source-level: a condition earlier in the same function that mentions the
 * balance or an amount, or compares the amount being sent.
 */

const SEND_CALL = /\b(sendAmount|sendBalance)\s*\(/g;
const CONDITION = /\b(?:if|while)\s*\(/g;
const MENTIONS_FUNDS = /getCurrentBalance\s*\(|\.amount\b|getAmount\s*\(/;
const RELATIONAL = /[<>]=?/;

/** First argument of the call whose `(` is at `open`. */
function firstArgument(text: string, open: number): string {
  const close = matchingClose(text, open);
  const inner = text.slice(open + 1, close < 0 ? undefined : close);
  let depth = 0;
  for (let i = 0; i < inner.length; i++) {
    if (inner[i] === "(" || inner[i] === "[") depth++;
    else if (inner[i] === ")" || inner[i] === "]") depth--;
    else if (inner[i] === "," && depth === 0) return inner.slice(0, i).trim();
  }
  return inner.trim();
}

function conditionsIn(text: string): string[] {
  return [...text.matchAll(CONDITION)].map((m) => {
    const open = m.index! + m[0].length - 1;
    const close = matchingClose(text, open);
    return text.slice(open + 1, close < 0 ? undefined : close);
  });
}

function isChecked(condition: string, amount: string): boolean {
  if (MENTIONS_FUNDS.test(condition)) return true;
  const normalised = (s: string) => s.replace(/\s+/g, "");
  return amount !== "" && normalised(condition).includes(normalised(amount)) && RELATIONAL.test(condition);
}

export const sendWithoutCheck: Rule = (ctx) => {
  const findings: LintFinding[] = [];
  for (const fn of ctx.functions) {
    for (const call of fn.body.matchAll(SEND_CALL)) {
      const amount = call[1] === "sendAmount" ? firstArgument(fn.body, call.index! + call[0].length - 1) : "";
      const earlier = fn.body.slice(0, call.index!);
      if (conditionsIn(earlier).some((c) => isChecked(c, amount))) continue;
      findings.push({
        rule: "send-without-check",
        severity: "warning",
        line: fn.startLine + lineAt(fn.body, call.index!) - 1,
        message: `\`${call[1]}\` is not preceded by a balance or amount check.`,
        hint:
          call[1] === "sendAmount"
            ? "Check the funds first: `if (getCurrentBalance() >= amount) { sendAmount(amount, recipient); }`."
            : "Check the funds first: `if (getCurrentBalance() > 0) { sendBalance(recipient); }`.",
      });
    }
  }
  return findings;
};
