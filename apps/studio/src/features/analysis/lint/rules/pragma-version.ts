import { lineAt } from "../source-structure";
import { COMPILER_VERSION, type LintFinding, type Rule } from "../types";

/**
 * Rule 6: pin the compiler version and the optimisation level in the source,
 * so a contract compiles to the same bytes when the Studio's compiler moves on.
 */

const VERSION = /^[ \t]*#pragma[ \t]+version[ \t]+(\S+)/m;
const OPTIMIZATION = /^[ \t]*#pragma[ \t]+optimizationLevel\b/m;

const majorMinor = (v: string) => v.split(".").slice(0, 2).join(".");

export const pragmaVersion: Rule = (ctx) => {
  const findings: LintFinding[] = [];
  const info = (line: number, message: string, hint: string, data: Record<string, string | number>) =>
    findings.push({ rule: "pragma-version", severity: "info", line, message, hint, data });

  const version = VERSION.exec(ctx.stripped);
  if (!version) {
    info(1, "`#pragma version` is missing.", `Pin the compiler: \`#pragma version ${majorMinor(COMPILER_VERSION)}\` at the top of the file.`, { variant: "missing", recommended: majorMinor(COMPILER_VERSION) });
  } else if (majorMinor(version[1]!) !== majorMinor(COMPILER_VERSION)) {
    info(
      lineAt(ctx.stripped, version.index),
      `\`#pragma version ${version[1]}\` differs from the Studio's compiler (${COMPILER_VERSION}).`,
      `Change it to \`#pragma version ${majorMinor(COMPILER_VERSION)}\` and re-test, or compile with a matching compiler.`,
      { variant: "differs", found: version[1]!, compiler: COMPILER_VERSION, recommended: majorMinor(COMPILER_VERSION) },
    );
  }
  if (!OPTIMIZATION.test(ctx.stripped)) {
    info(1, "`#pragma optimizationLevel` is missing.", "Set it explicitly, e.g. `#pragma optimizationLevel 2`, so the output does not depend on the compiler default.", { variant: "missingOptimization" });
  }
  return findings;
};
