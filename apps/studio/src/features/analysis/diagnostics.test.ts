import { describe, expect, it } from "bun:test";
import { deployParamsFor } from "@/features/deployment/deploy-params";
import { fixture } from "./lint/__fixtures__/load";
import { lintContract } from "./lint/lint";
import type { LintFinding } from "./lint/types";
import { ANALYSIS_OWNER, toMarkers } from "./diagnostics";

// Monaco's MarkerSeverity numbers, passed in so the module never imports monaco.
const SEVERITY = { Error: 8, Warning: 4, Info: 2 };

const finding = (over: Partial<LintFinding> = {}): LintFinding => ({
  rule: "switch-no-default",
  severity: "warning",
  line: 3,
  message: "english",
  hint: "english hint",
  ...over,
});

type RuleIdLike = LintFinding["rule"];

describe("toMarkers", () => {
  it("maps severities", () => {
    const markers = toMarkers(
      [finding({ severity: "error" }), finding({ severity: "warning" }), finding({ severity: "info" })],
      SEVERITY,
    );
    expect(markers.map((m) => m.severity)).toEqual([8, 4, 2]);
  });

  it("emits one marker per finding at its line, full-line range", () => {
    const markers = toMarkers([finding({ line: 3 }), finding({ line: 9, rule: "unbounded-loop" })], SEVERITY);
    expect(markers).toHaveLength(2);
    expect(markers[0]).toMatchObject({ startLineNumber: 3, endLineNumber: 3, startColumn: 1, source: "smartc-lint", code: "switch-no-default" });
    expect(markers[0]!.endColumn).toBeGreaterThan(1000);
    expect(markers[1]).toMatchObject({ startLineNumber: 9, code: "unbounded-loop" });
  });

  it("carries the translated message and hint, interpolating the finding's data", () => {
    const [m] = toMarkers(
      [finding({ rule: "overwritten-param", data: { name: "owner" } })],
      SEVERITY,
    );
    const [message, hint] = m!.message.split("\n");
    expect(message).toContain("`owner` is a deploy parameter");
    expect(hint).toContain("Drop the write");
  });

  it("translates every rule the lint can emit, with no raw key left over", () => {
    const stock = lintContract("#program name X\nlong a;\nvoid main(void){ while(1){ a++; } switch(a){case 1: a=2; break;} }");
    const markers = toMarkers(stock.findings, SEVERITY);
    expect(markers.length).toBeGreaterThan(0);
    for (const m of markers) expect(m.message).not.toContain("smartc-editor.analysis");
  });

  it("exposes its own marker owner", () => {
    expect(ANALYSIS_OWNER).toBe("smartc-analysis");
  });
});

/**
 * The JSON text is a translation source for the English the rules emit for
 * agents; if the two drift, the editor and the agent describe the same
 * finding differently.
 */
describe("English parity with the rules", () => {
  const noDirective = "struct TXINFO { long txId, sender, amount, method; } currentTX;\nlong n;\nvoid main(void) {\n  while ((currentTX.txId = getNextTx()) != 0) {\n    if (currentTX.method == 1) { n = n * 3 + 1; }\n  }\n  for (n = 0; n < 20; n++) { n = n + 0; }\n}";
  const incomplete = `#program activationAmount 100\n${noDirective}`;
  const cases: [string, string, RuleIdLike][] = [
    ["sender-check", fixture("sender-check-fires"), "sender-check"],
    ["send-without-check sendAmount", fixture("send-without-check-fires"), "send-without-check"],
    ["send-without-check sendBalance", "void b(long to) {\n  sendBalance(to);\n}", "send-without-check"],
    ["unbounded-loop", fixture("unbounded-loop-fires"), "unbounded-loop"],
    ["switch-no-default", fixture("switch-no-default-fires"), "switch-no-default"],
    ["pragma missing", fixture("pragma-fires"), "pragma-version"],
    ["pragma differs", "#pragma version 1.0\n#pragma optimizationLevel 2\n", "pragma-version"],
    ["activation complete", fixture("activation-below-gas-fires"), "activation-below-gas"],
    ["activation incomplete", incomplete, "activation-below-gas"],
    ["activation no directive", fixture("activation-below-gas-missing"), "activation-below-gas"],
    ["no-catch info", fixture("no-catch-fires"), "no-catch"],
    ["no-catch warning", fixture("no-catch-sends-fires"), "no-catch"],
    ["catch-recurring-fault", fixture("catch-resume"), "catch-recurring-fault"],
    ["overwritten-param", fixture("overwritten-param-fires"), "overwritten-param"],
  ];

  for (const [name, source, rule] of cases) {
    it(name, () => {
      const findings = lintContract(source, { params: deployParamsFor(source, []) }).findings.filter((f) => f.rule === rule);
      expect(findings.length).toBeGreaterThan(0);
      const markers = toMarkers(findings, SEVERITY);
      findings.forEach((f, i) => expect(markers[i]!.message).toBe(`${f.message}\n${f.hint}`));
    });
  }
});
