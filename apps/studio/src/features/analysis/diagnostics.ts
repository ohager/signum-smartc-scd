import type * as Monaco from "monaco-editor";
import { FileSystem } from "@/lib/file-system";
import { deployParamsFor } from "@/features/deployment/deploy-params";
import { t } from "@/i18n/runtime";
import type { SlotLabel } from "@/features/inspector/model/label-map";
import { ensureLabelMapCache, getCachedLabelMaps } from "./label-map-cache";
import type { LintFinding, RuleId } from "./lint/types";

/** Its own owner, so the compile markers under "smartc" are never touched. */
export const ANALYSIS_OWNER = "smartc-analysis";

export interface SeverityMap {
  Error: number;
  Warning: number;
  Info: number;
}

/** Rule ids contain dashes, which the i18n key scheme does not allow. */
const camel = (rule: RuleId) => rule.replace(/-(\w)/g, (_, c: string) => c.toUpperCase());

type Params = Record<string, string | number>;
type Text = { message: string; hint: string };

const ns = (rule: RuleId, key: string) => `smartc-editor.analysis.${camel(rule)}.${key}`;
// The keys are built from rule ids at runtime, so they cannot be typed literals.
const tr = (key: string, params?: Params) => t(key as never, params as never) as string;

/**
 * Most rules map to one message/hint pair. The rest assemble their text from
 * parts or pick a variant, because splicing English fragments in code would
 * leave them untranslatable.
 */
function textFor(f: LintFinding): Text {
  const d: Params = f.data ?? {};
  const own = (key: string, params: Params = d) => tr(ns(f.rule, key), params);
  switch (f.rule) {
    case "sender-check": {
      const what = [
        d.globals ? own("writesGlobals") : null,
        d.mapWrites ? own("writesMaps") : null,
        d.sends ? own("sendsFunds") : null,
      ]
        .filter(Boolean)
        .join(own("and"));
      return { message: own("message", { ...d, what }), hint: own("hint") };
    }
    case "send-without-check":
      return { message: own("message"), hint: own(d.call === "sendAmount" ? "hintAmount" : "hintBalance") };
    case "activation-below-gas": {
      const where = d.handler ? own(d.method === "" ? "where" : "whereMethod") : "";
      const cost = own(d.atLeast ? "costAtLeast" : "cost", { ...d, where });
      const hint = [own("hint"), d.capHit ? own("hintLoopCap") : null, d.atLeast ? own("hintNoSwitch") : null]
        .filter(Boolean)
        .join(" ");
      return { message: own(d.hasDirective ? "message" : "messageNoDirective", { ...d, cost }), hint };
    }
    case "pragma-version": {
      const variant = String(d.variant);
      return { message: own(`${variant}.message`), hint: own(`${variant}.hint`) };
    }
    case "no-catch":
      return { message: own(d.sends ? "messageSends" : "message"), hint: own("hint") };
    case "catch-recurring-fault":
      return { message: own("message"), hint: own(d.what === "division" ? "hintDivision" : "hintRecursion") };
    default:
      return { message: own("message"), hint: own("hint") };
  }
}

const severityOf = (f: LintFinding, s: SeverityMap) =>
  f.severity === "error" ? s.Error : f.severity === "warning" ? s.Warning : s.Info;

/** Wide enough for any line: Monaco clamps the end column to the line length. */
const LINE_END = 100_000;

/** Pure: one full-line marker per finding, text in the active locale. */
export function toMarkers(findings: LintFinding[], severity: SeverityMap): Monaco.editor.IMarkerData[] {
  return findings.map((f) => {
    const { message, hint } = textFor(f);
    return {
      severity: severityOf(f, severity),
      message: `${message}\n${hint}`,
      startLineNumber: f.line,
      startColumn: 1,
      endLineNumber: f.line,
      endColumn: LINE_END,
      source: "smartc-lint",
      code: f.rule,
    };
  });
}

/**
 * The deploy parameters the lint needs, derived on the main thread because
 * the Label Maps live here (one compile, a few ms). The cache loads on first
 * use, so the very first call labels parameters from the TESTBED convention only.
 */
export function lintParams(source: string): SlotLabel[] {
  ensureLabelMapCache(FileSystem.getInstance());
  return deployParamsFor(source, getCachedLabelMaps());
}
