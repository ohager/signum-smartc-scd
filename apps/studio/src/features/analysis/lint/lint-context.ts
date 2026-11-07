import { compileVerbose } from "@/features/deployment/overwritten-params";
import type { SlotLabel } from "@/features/inspector/model/label-map";
import { stripCommentsAndStrings } from "@/features/smartc-editor/language/symbol-scanner";
import { findFunctions, findMainSwitches } from "./source-structure";
import type { FunctionSpan, LintContext } from "./types";

/**
 * Handlers are what the dispatch `switch` in `main` hands work to: the
 * functions its cases call, and the case bodies themselves. A heuristic, kept
 * apart from the span finding so it can be narrowed on its own.
 */
function findHandlers(functions: FunctionSpan[], switches: LintContext["switches"]): FunctionSpan[] {
  const calledNames = new Set(switches.flatMap((s) => s.cases.flatMap((c) => c.calls)));
  const called = functions.filter((f) => calledNames.has(f.name));
  return [...called, ...switches.flatMap((s) => s.cases)];
}

/** Compiles once and finds the source structure every rule works on. */
export function buildLintContext(source: string, opts: { params?: SlotLabel[] } = {}): LintContext {
  const stripped = stripCommentsAndStrings(source);
  const functions = findFunctions(stripped);
  const switches = findMainSwitches(stripped, functions);
  return {
    source,
    stripped,
    lines: source.split("\n"),
    functions,
    handlers: findHandlers(functions, switches),
    switches,
    verbose: compileVerbose(source),
    params: opts.params ?? [],
  };
}
