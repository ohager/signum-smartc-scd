import { lineAt, matchingClose } from "../source-structure";
import type { LintFinding, Rule } from "../types";

/**
 * Rule 3: a loop should visibly move towards its end. A contract that spins
 * burns its gas for nothing, or until the step limit kills the transaction.
 * "Visibly" is deliberately simple: the condition compares an identifier and
 * the loop changes that identifier. The `getNextTx` loop is how a contract
 * ends its run, so it is exempt.
 */

const LOOP_HEAD = /\b(while|for)\s*\(/g;
const COMPARISON_ID = /([A-Za-z_][\w.]*)\s*(?:<=|>=|<|>|!=)(?!=)|(?:<=|>=|<|>|!=)\s*([A-Za-z_][\w.]*)/g;

interface Loop {
  line: number;
  condition: string;
  /** Text that runs between iterations: the loop body, plus a `for` increment. */
  repeated: string;
}

/** Index of the `{` that closes backwards to the `}` at `close`, or -1. */
function matchingOpen(text: string, close: number): number {
  let depth = 0;
  for (let i = close; i >= 0; i--) {
    if (text[i] === "}") depth++;
    else if (text[i] === "{" && --depth === 0) return i;
  }
  return -1;
}

/** The statement or block starting at the first non-space character from `from`. */
function statementAt(text: string, from: number): string {
  const start = from + (/^\s*/.exec(text.slice(from))![0].length);
  if (text[start] === "{") {
    const end = matchingClose(text, start);
    return text.slice(start, end < 0 ? undefined : end + 1);
  }
  const semicolon = text.indexOf(";", start);
  return text.slice(start, semicolon < 0 ? undefined : semicolon + 1);
}

/** Splits `for (init; cond; incr)` header contents at top-level semicolons. */
function forParts(header: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < header.length; i++) {
    if ("([".includes(header[i]!)) depth++;
    else if (")]".includes(header[i]!)) depth--;
    else if (header[i] === ";" && depth === 0) {
      parts.push(header.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(header.slice(start));
  return parts;
}

function findLoops(stripped: string): Loop[] {
  const loops: Loop[] = [];
  for (const m of stripped.matchAll(LOOP_HEAD)) {
    const open = m.index! + m[0].length - 1;
    const close = matchingClose(stripped, open);
    if (close < 0) continue;
    const header = stripped.slice(open + 1, close);
    const rest = stripped.slice(close + 1);

    if (m[1] === "for") {
      const [, condition = "", increment = ""] = forParts(header);
      loops.push({ line: lineAt(stripped, m.index!), condition, repeated: statementAt(stripped, close + 1) + increment });
      continue;
    }

    if (/^\s*;/.test(rest)) {
      // `while (…);` closes a do-while when a block introduced by `do` sits in front of it.
      const before = stripped.slice(0, m.index!).trimEnd();
      const blockOpen = before.endsWith("}") ? matchingOpen(before, before.length - 1) : -1;
      const doAt = blockOpen < 0 ? -1 : before.slice(0, blockOpen).trimEnd().search(/\bdo$/);
      if (doAt >= 0) {
        loops.push({ line: lineAt(stripped, doAt), condition: header, repeated: before.slice(blockOpen) });
        continue;
      }
    }
    loops.push({ line: lineAt(stripped, m.index!), condition: header, repeated: statementAt(stripped, close + 1) });
  }
  return loops;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function changes(id: string, text: string): boolean {
  const x = escape(id);
  return new RegExp(`(?:\\+\\+|--)\\s*${x}\\b|\\b${x}\\s*(?:\\+\\+|--|\\+=|-=|=(?!=))`).test(text);
}

function isBounded({ condition, repeated }: Loop): boolean {
  const ids = [...condition.matchAll(COMPARISON_ID)].map((m) => m[1] ?? m[2]!);
  return ids.some((id) => changes(id, repeated));
}

const ALWAYS_TRUE = /^\s*(?:1|true)?\s*$/;

export const unboundedLoop: Rule = (ctx) => {
  const findings: LintFinding[] = [];
  for (const loop of findLoops(ctx.stripped)) {
    if (/getNextTx/.test(loop.condition)) continue;
    if (!ALWAYS_TRUE.test(loop.condition) && isBounded(loop)) continue;
    findings.push({
      rule: "unbounded-loop",
      severity: "warning",
      line: loop.line,
      message: "This loop has no recognisable bound; the condition is not driven by anything the body changes.", // i18n-ignore
      hint: "Count towards a limit the condition tests: `for (i = 0; i < 10; i++) { … }`, or move the work into the `getNextTx` loop so each activation does a bounded amount.",
    });
  }
  return findings;
};
