import { describe, expect, it } from "bun:test";
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
