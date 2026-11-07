import type * as Monaco from "monaco-editor";
import { scanSymbols } from "./symbol-scanner";
import { analyzeWithCompiler } from "./compiler-symbols";
import { ANALYSIS_OWNER, analysisMarkers } from "@/features/analysis/diagnostics";
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
  monaco.editor.setModelMarkers(model, ANALYSIS_OWNER, lintMarkers(monaco, source));
}

/**
 * A lint crash must not cost the user the compile markers or the symbol
 * cache, which are already set by now.
 */
function lintMarkers(monaco: typeof Monaco, source: string): Monaco.editor.IMarkerData[] {
  try {
    const { Error, Warning, Info } = monaco.MarkerSeverity;
    return analysisMarkers(source, { Error, Warning, Info });
  } catch (e) {
    console.error("smartc lint failed", e);
    return [];
  }
}

export function clearModel(model: Monaco.editor.ITextModel): void {
  cache.delete(model.uri.toString());
  // Analysis markers need no clearing here: Monaco drops every owner's markers when the model is disposed.
}
