#!/usr/bin/env bun
/**
 * Lists user-facing text that is still hardcoded: JSX text, labelled JSX
 * attributes, toast messages and label-like object properties. A line (or the
 * line after a comment) containing `i18n-ignore` is skipped.
 */
import ts from "typescript";
import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";

const ATTRIBUTES = new Set(["title", "label", "placeholder", "aria-label", "alt", "description", "tooltip"]);
const PROPERTIES = new Set(["title", "label", "description", "placeholder", "tooltip", "message"]);
/** Two letters in a row, in any script — excludes "·", "→", "42". */
const WORDY = /\p{L}{2,}/u;
/** Words with whitespace between them — a sentence, not a token like "bad". */
const SENTENCE = /\p{L}+\s+\p{L}+/u;
/** Utility-class lists (`bg-muted text-muted-foreground`), not prose. */
const isClassList = (v: string) =>
  v.split(/\s+/).every((w) => /^[a-z0-9\-:\[\]()=_\/.%&!*>]+$/.test(w)) && /[-:\[]/.test(v);
/** Names that are never translated. */
const NEVER = new Set(["SmartC", "Signum", "SIGNA", "Studio", "Nexus", "Dawn", "Solaris", "Terminal"]);

export interface Finding {
  line: number;
  text: string;
}

export function scanSource(fileName: string, text: string): Finding[] {
  const kind = fileName.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, text, ts.ScriptTarget.Latest, true, kind);
  const lines = text.split("\n");
  const ignored = (line: number) =>
    lines[line]?.includes("i18n-ignore") || lines[line - 1]?.includes("i18n-ignore");
  const out: Finding[] = [];

  const report = (node: ts.Node, value: string) => {
    const v = value.trim();
    if (!WORDY.test(v) || NEVER.has(v)) return;
    const line = sf.getLineAndCharacterOfPosition(node.getStart(sf)).line;
    if (!ignored(line)) out.push({ line: line + 1, text: v });
  };
  const literal = (n: ts.Node | undefined): string | undefined =>
    n && (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n))
      ? n.text
      : n && ts.isTemplateExpression(n)
        ? n.head.text + n.templateSpans.map((s) => s.literal.text).join(" ")
        : undefined;

  /** Literals chosen by a condition or a fallback: `a ? "x y" : "z w"`, `m || "x y"`. */
  const branches = (node: ts.Node) => {
    const candidates: ts.Node[] = [];
    if (ts.isConditionalExpression(node)) candidates.push(node.whenTrue, node.whenFalse);
    else if (
      ts.isBinaryExpression(node) &&
      (node.operatorToken.kind === ts.SyntaxKind.BarBarToken ||
        node.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)
    )
      candidates.push(node.right);
    for (const c of candidates) {
      const v = literal(c);
      if (v !== undefined && SENTENCE.test(v) && !isClassList(v.trim())) report(c, v);
    }
  };

  const visit = (node: ts.Node) => {
    branches(node);
    if (ts.isJsxText(node)) report(node, node.text);
    else if (ts.isJsxAttribute(node) && ATTRIBUTES.has(node.name.getText(sf))) {
      const init = node.initializer;
      const v = init && ts.isJsxExpression(init) ? literal(init.expression) : literal(init);
      if (v !== undefined) report(node, v);
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      const v = literal(node.expression);
      if (v !== undefined) report(node, v);
    } else if (ts.isCallExpression(node) && /^toast(\.\w+)?$/.test(node.expression.getText(sf))) {
      const v = literal(node.arguments[0]);
      if (v !== undefined) report(node, v);
    } else if (ts.isPropertyAssignment(node) && PROPERTIES.has(node.name.getText(sf).replace(/["']/g, ""))) {
      const v = literal(node.initializer);
      if (v !== undefined) report(node, v);
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
}

function* files(target: string): Generator<string> {
  if (statSync(target).isFile()) {
    yield target;
    return;
  }
  for (const e of readdirSync(target, { withFileTypes: true })) {
    const p = path.join(target, e.name);
    if (e.isDirectory()) {
      if (["node_modules", "i18n", "language-definitions", "runner"].includes(e.name)) continue;
      yield* files(p);
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) && !e.name.endsWith(".generated.ts")) {
      yield p;
    }
  }
}

if (import.meta.main) {
  const targets = process.argv.slice(2);
  let count = 0;
  for (const target of targets.length ? targets : ["src"]) {
    for (const file of files(target)) {
      for (const f of scanSource(file, readFileSync(file, "utf8"))) {
        console.log(`${file}:${f.line}  ${f.text}`);
        count++;
      }
    }
  }
  console.log(count ? `\n${count} hardcoded strings` : "clean");
  process.exit(count ? 1 : 0);
}
