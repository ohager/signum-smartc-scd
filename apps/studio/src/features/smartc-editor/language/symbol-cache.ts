import type * as Monaco from "monaco-editor";
import { scanSymbols } from "./symbol-scanner";
import { analyzeWithCompiler } from "./compiler-symbols";
import { ANALYSIS_OWNER, lintParams, toMarkers } from "@/features/analysis/diagnostics";
import { onLabelMapsChanged } from "@/features/analysis/label-map-cache";
import { analysisClient } from "@/features/analysis/worker/analysis-client";
import { type SmartCSymbols, emptySymbols, mergeSymbols } from "./symbols";

const cache = new Map<string, SmartCSymbols>();

export function getSymbols(model: Monaco.editor.ITextModel): SmartCSymbols {
  return cache.get(model.uri.toString()) ?? emptySymbols();
}

export function updateModel(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
): void {
  const source = model.getValue();
  const { error, compiler } = analyzeWithCompiler(source);

  cache.set(model.uri.toString(), mergeSymbols(scanSymbols(source), compiler));

  const markers: Monaco.editor.IMarkerData[] = [];
  if (error) {
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      message: error.message,
      startLineNumber: error.line,
      startColumn: error.column,
      endLineNumber: error.line,
      endColumn: error.column + 1,
    });
  }
  if (compiler && compiler.warnings.trim()) {
    markers.push({
      severity: monaco.MarkerSeverity.Warning,
      message: compiler.warnings.trim(),
      startLineNumber: 1,
      startColumn: 1,
      endLineNumber: 1,
      endColumn: 2,
    });
  }
  monaco.editor.setModelMarkers(model, "smartc", markers);
  requestAnalysis(monaco, model, source);
}

const analysed = new Set<Monaco.editor.ITextModel>();
let unsubscribe: (() => void) | null = null;

/**
 * The lint runs in a worker (the gas rule takes seconds on a big contract), so
 * its answer can arrive after the user has typed on. Markers are applied only
 * if the model is still alive and still at the version that was linted.
 */
function requestAnalysis(monaco: typeof Monaco, model: Monaco.editor.ITextModel, source: string): void {
  analysed.add(model);
  // A Label Map change renames deploy parameters, so open models are linted again.
  unsubscribe ??= onLabelMapsChanged(() => {
    for (const m of analysed) if (!m.isDisposed()) requestAnalysis(monaco, m, m.getValue());
  });
  const version = model.getVersionId();
  void analysisClient()
    .lint(model.uri.toString(), source, lintParams(source))
    .then((result) => {
      if (!result || model.isDisposed() || model.getVersionId() !== version) return;
      const { Error, Warning, Info } = monaco.MarkerSeverity;
      monaco.editor.setModelMarkers(model, ANALYSIS_OWNER, toMarkers(result.findings, { Error, Warning, Info }));
    })
    .catch((e) => console.error("smartc lint failed", e));
}

export function clearModel(model: Monaco.editor.ITextModel): void {
  cache.delete(model.uri.toString());
  // Monaco drops every owner's markers when the model is disposed.
  analysed.delete(model);
}
