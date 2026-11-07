import { assemblyEffects, changesState, type Effects } from "../assembly-effects";
import type { FunctionSpan, LintFinding, Rule } from "../types";

/**
 * Rule 1: a handler that changes state or moves funds should first compare
 * the sender with an owner. Whether it does is read from the source; whether
 * it changes state comes from the assembly, which has already resolved
 * helpers, macros and struct members.
 */

const SENDER = String.raw`(?:getSender\s*\([^)]*\)|[\w.]*[sS]ender\b)`;
const OWNER = String.raw`(?:[\w.]*(?:owner|creator|admin)\w*|getCreator\s*\(\s*\))`;
const SENDER_CHECK = new RegExp(`${SENDER}\\s*[!=]=\\s*${OWNER}|${OWNER}\\s*[!=]=\\s*${SENDER}`, "i");

const checksSender = (text: string) => SENDER_CHECK.test(text);

const HINT =
  "Compare the sender with the owner before changing state: `if (getSender(currentTX.txId) != owner) { continue; }` " +
  "in the dispatch loop, or `if (currentTX.sender != getCreator()) { return; }` at the top of the handler.";

function finding(handler: FunctionSpan, effects: Effects): LintFinding {
  const what = [
    effects.globals.length > 0 ? `writes ${effects.globals.join(", ")}` : null,
    effects.mapWrites ? "writes map values" : null,
    effects.sends ? "sends funds" : null,
  ]
    .filter(Boolean)
    .join(" and ");
  return {
    rule: "sender-check",
    severity: "warning",
    line: handler.startLine,
    message: `Handler \`${handler.name}\` ${what} without checking who sent the transaction.`,
    hint: HINT,
  };
}

export const senderCheck: Rule = (ctx) => {
  if (!ctx.verbose) return [];
  const effects = assemblyEffects(ctx.verbose, ctx.functions.map((f) => f.name));
  const findings: LintFinding[] = [];

  // Inline case bodies: only what they do themselves; a called helper is judged as a handler of its own.
  for (const sw of ctx.switches) {
    for (const body of sw.cases) {
      const own = effects.ofLines(body.startLine, body.endLine);
      if (changesState(own) && !checksSender(sw.preamble) && !checksSender(body.body)) findings.push(finding(body, own));
    }
  }

  // Called functions, judged once however many cases call them.
  for (const handler of ctx.handlers.filter((h) => ctx.functions.includes(h))) {
    const all = effects.ofFunction(handler.name);
    if (!changesState(all)) continue;
    // Text that runs before the handler does: the dispatch preamble and the calling case body.
    const beforeHandler = ctx.switches.flatMap((sw) =>
      sw.cases.filter((c) => c.calls.includes(handler.name)).map((c) => ({ preamble: sw.preamble, caseBody: c.body })),
    );
    const guarded = checksSender(handler.body) || beforeHandler.some((c) => checksSender(c.preamble) || checksSender(c.caseBody));
    if (!guarded) findings.push(finding(handler, all));
  }
  return findings.sort((a, b) => a.line - b.line);
};
