import {
  CALL,
  FUNCTION_LABEL,
  functionBodies,
  reachableBodies,
  SOURCE_LINE,
  type FunctionBody,
} from "@/features/deployment/overwritten-params";
import type { LintFinding, Rule } from "../types";

/**
 * Rule 7: without a `void catch()` a fatal fault (division by zero, stack
 * overflow, out of gas) leaves the contract dead for good. SmartC compiles a
 * handler to an `ERR :__fn_catch` line, so its absence is what we look for.
 */

const ERR_LINE = /^\s*ERR\s+:/m;
const SENDS_FUNDS = /\bsend[A-Z]\w*\s*\(/;

const RESUME_HINT =
  "Resume: `void catch() { asm { JMP :__fn_main } }` — the faulting transaction was already consumed by `getNextTx`, so the contract carries on with the next one.";
const WIND_DOWN_HINT = "Wind down: `void catch() { sendBalance(getCreator()); exit; }`.";

export const noCatch: Rule = (ctx) => {
  if (!ctx.verbose || ERR_LINE.test(ctx.verbose.assembly)) return [];
  const sends = SENDS_FUNDS.test(ctx.stripped);
  const main = ctx.functions.find((f) => f.name === "main");
  return [
    {
      rule: "no-catch",
      severity: sends ? "warning" : "info",
      line: main?.startLine ?? 1,
      message: sends
        ? "No `catch` handler: after a fatal fault the contract stays dead, with its balance locked in it." // i18n-ignore
        : "No `catch` handler: after a fatal fault the contract stays dead.", // i18n-ignore
      hint: `Add a global error handler. ${RESUME_HINT} ${WIND_DOWN_HINT}`,
      data: { sends: sends ? 1 : 0 },
    },
  ];
};

/** A divisor that is a plain non-zero number cannot fault. */
function canFault(sourceLine: string): boolean {
  const divisions = [...sourceLine.matchAll(/[/%]=?\s*([^\s;,)]*)/g)];
  return divisions.length === 0 || divisions.some((d) => !/^[1-9][\d_]*$/.test(d[1]!));
}

const isRecursive = (fn: string, bodies: Map<string, FunctionBody>): boolean => {
  const self = bodies.get(fn);
  return !!self && [...self.calls].some((c) => reachableBodies(c, bodies).includes(self));
};

interface Site {
  line: number;
  what: "division" | "recursion";
}

/**
 * What runs on every activation outside the loop body: `main` before the
 * `getNextTx` loop and after it. The init section is left out on purpose: it
 * runs once, and `main`'s `PCS` moves the restart point past it.
 */
function repeatedCode(assembly: string): Site[] {
  const lines = assembly.split("\n");
  const bodies = functionBodies(lines);
  const sites: Site[] = [];
  let inMain = false;
  let phase: "pre" | "loop" | "post" = "pre";
  let breakLabel: string | null = null;
  let line = 0;

  for (const text of lines) {
    const label = FUNCTION_LABEL.exec(text);
    if (label) {
      inMain = label[1] === "__fn_main";
      continue;
    }
    if (!inMain) continue;
    const source = SOURCE_LINE.exec(text);
    if (source) {
      line = Number(source[1]);
      continue;
    }
    if (phase === "pre" && /^\s*FUN\s+A_to_Tx_after_Timestamp\b/.test(text)) phase = "loop";
    else if (phase === "loop") {
      if (!breakLabel) breakLabel = /^\s*BZR\s+\$\w+\s+:(__loop\d+_break)\b/.exec(text)?.[1] ?? null;
      else if (text.trim() === `${breakLabel}:`) phase = "post";
      continue;
    }
    if (/^\s*(DIV|MOD)\s+@/.test(text)) sites.push({ line, what: "division" });
    const call = CALL.exec(text);
    if (call && isRecursive(call[1]!, bodies)) sites.push({ line, what: "recursion" });
  }
  return sites;
}

export const catchRecurringFault: Rule = (ctx) => {
  if (!ctx.verbose) return [];
  const handler = ctx.functions.find((f) => f.name === "catch");
  // Judged from the source: the optimiser drops a jump to the next instruction.
  if (!handler || !/\bJMP\s+:__fn_main\b/.test(handler.body)) return [];

  const strippedLines = ctx.stripped.split("\n");
  const seen = new Set<number>();
  const findings: LintFinding[] = [];
  for (const site of repeatedCode(ctx.verbose.assembly)) {
    if (seen.has(site.line)) continue;
    if (site.what === "division" && !canFault(strippedLines[site.line - 1] ?? "")) continue;
    seen.add(site.line);
    findings.push({
      rule: "catch-recurring-fault",
      severity: "warning",
      line: site.line,
      message: "A fault here recurs on every activation and burns gas until the balance is gone.", // i18n-ignore
      data: { what: site.what },
      hint: `The \`catch\` handler resumes at \`main\`, which runs this ${site.what === "division" ? "division" : "recursive call"} again. Guard it (check the divisor, bound the recursion), move it into a handler, or wind down instead: \`void catch() { sendBalance(getCreator()); exit; }\`.`, // i18n-ignore
    });
  }
  return findings;
};
