import type { CaseSpan, FunctionSpan, SwitchSpan } from "./types";

/**
 * Structure recovered from stripped source with bracket matching, not a
 * parser: the rules only need to know where functions, switches and their
 * cases sit. Every helper takes the stripped text, where comments and strings
 * are blank, so braces in either cannot confuse the matching.
 */

/** 1-based line of a character index. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text[i] === "\n") line++;
  return line;
}

const PAIRS: Record<string, string> = { "(": ")", "{": "}", "[": "]" };

/** Index of the bracket that closes the one at `open`, or -1. */
export function matchingClose(text: string, open: number): number {
  const opener = text[open]!;
  const closer = PAIRS[opener]!;
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === opener) depth++;
    else if (text[i] === closer && --depth === 0) return i;
  }
  return -1;
}

/** Brace depth in front of every character, so "top level" is a lookup. */
function braceDepths(text: string): number[] {
  const depths: number[] = [];
  let depth = 0;
  for (const ch of text) {
    if (ch === "}") depth--;
    depths.push(depth);
    if (ch === "{") depth++;
  }
  return depths;
}

const FUNCTION_HEAD = /\b(?:long|fixed|void|struct\s+\w+)\b[\s*]*(\w+)\s*\(/g;

/** Top-level function definitions (prototypes and variable declarations are skipped). */
export function findFunctions(stripped: string): FunctionSpan[] {
  const depths = braceDepths(stripped);
  const spans: FunctionSpan[] = [];
  for (const match of stripped.matchAll(FUNCTION_HEAD)) {
    const start = match.index!;
    if (depths[start] !== 0) continue;
    const open = start + match[0].length - 1;
    const close = matchingClose(stripped, open);
    if (close < 0) continue;
    const brace = /^\s*\{/.exec(stripped.slice(close + 1));
    if (!brace) continue;
    const bodyOpen = close + brace[0].length;
    const bodyClose = matchingClose(stripped, bodyOpen);
    if (bodyClose < 0) continue;
    spans.push({
      name: match[1]!,
      startLine: lineAt(stripped, start),
      endLine: lineAt(stripped, bodyClose),
      body: stripped.slice(start, bodyClose + 1),
    });
  }
  return spans;
}

const CASE_LABEL = /\b(case\b[^:;{}]*|default)\s*:(?!:)/g;

/** The `case`/`default` bodies of one switch block (`open` is its `{`). */
function findCases(stripped: string, open: number, close: number, functionNames: string[]): CaseSpan[] {
  const depths = braceDepths(stripped);
  const labels = [...stripped.slice(open + 1, close).matchAll(CASE_LABEL)]
    .map((m) => ({ text: m[1]!.trim(), start: open + 1 + m.index!, end: open + 1 + m.index! + m[0].length }))
    // Labels of nested switches and blocks belong to those, not to this one.
    .filter((l) => depths[l.start] === depths[open]! + 1);
  return labels.map((label, i) => {
    const bodyEnd = labels[i + 1]?.start ?? close;
    const text = stripped.slice(label.end, bodyEnd);
    const trimmed = text.trimEnd();
    return {
      name: label.text.replace(/\s+/g, " "),
      startLine: lineAt(stripped, label.start),
      endLine: lineAt(stripped, label.end + Math.max(trimmed.length - 1, 0)),
      body: text,
      calls: calledFunctions(text, functionNames),
    };
  });
}

/** Source functions invoked in `text`, in order of first use. */
export function calledFunctions(text: string, functionNames: string[]): string[] {
  const called = new Set<string>();
  for (const m of text.matchAll(/\b(\w+)\s*\(/g)) if (functionNames.includes(m[1]!)) called.add(m[1]!);
  return [...called];
}

/** The `switch` statements inside `main`. */
export function findMainSwitches(stripped: string, functions: FunctionSpan[]): SwitchSpan[] {
  const main = functions.find((f) => f.name === "main");
  if (!main) return [];
  const functionNames = functions.filter((f) => f.name !== "main").map((f) => f.name);
  const mainStart = stripped.indexOf(main.body);
  const switches: SwitchSpan[] = [];
  for (const m of main.body.matchAll(/\bswitch\s*\(/g)) {
    const at = mainStart + m.index!;
    const conditionClose = matchingClose(stripped, at + m[0].length - 1);
    const open = conditionClose < 0 ? -1 : stripped.indexOf("{", conditionClose);
    const close = open < 0 ? -1 : matchingClose(stripped, open);
    if (close < 0) continue;
    const cases = findCases(stripped, open, close, functionNames);
    switches.push({
      line: lineAt(stripped, at),
      hasDefault: cases.some((c) => c.name === "default"),
      cases,
      preamble: stripped.slice(mainStart, at),
    });
  }
  return switches;
}
