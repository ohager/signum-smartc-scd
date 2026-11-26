import type { SlotLabel } from "@/features/inspector/model/label-map";
import { version } from "smartc-signum-compiler/package.json";

/**
 * The compiler the Studio ships. Read from the package so the version rule
 * cannot drift when the dependency is bumped.
 */
export const COMPILER_VERSION: string = version;

export type Severity = "error" | "warning" | "info";

export type RuleId =
  | "sender-check"
  | "send-without-check"
  | "unbounded-loop"
  | "activation-below-gas"
  | "switch-no-default"
  | "pragma-version"
  | "no-catch"
  | "catch-recurring-fault"
  | "overwritten-param";

export interface LintFinding {
  rule: RuleId;
  severity: Severity;
  /** 1-based source line. */
  line: number;
  message: string;
  hint: string;
  /**
   * The values interpolated into `message`/`hint`, kept structured so the
   * editor can translate them. Agents read the English text; the UI reads this.
   */
  data?: Record<string, string | number>;
}

/** A function, or a `case` body treated like one. Lines are 1-based and inclusive. */
export interface FunctionSpan {
  name: string;
  startLine: number;
  endLine: number;
  /** Stripped source from the first line of the declaration; line `n` of the body is `startLine + n`. */
  body: string;
}

/** One `case`/`default` of a switch, with the functions its body calls. */
export interface CaseSpan extends FunctionSpan {
  /** Names of source functions called from this body. */
  calls: string[];
}

export interface SwitchSpan {
  line: number;
  hasDefault: boolean;
  cases: CaseSpan[];
  /** Everything in the enclosing function before the `switch`, e.g. a sender guard in the dispatch loop. */
  preamble: string;
}

export interface LintContext {
  source: string;
  /** Comments and strings blanked, same line structure as `source`. */
  stripped: string;
  lines: string[];
  functions: FunctionSpan[];
  handlers: FunctionSpan[];
  /** The `switch` statements inside `main`. */
  switches: SwitchSpan[];
  /** Assembly and memory from the compiler; null if the source does not compile. */
  verbose: { assembly: string; memory: string[] } | null;
  params: SlotLabel[];
}

export type Rule = (ctx: LintContext) => LintFinding[];
