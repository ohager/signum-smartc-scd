import type * as Monaco from "monaco-editor";
import { SmartC } from "smartc-signum-compiler";
import { scanSymbols } from "./symbol-scanner";
import { type SmartCSymbols, emptySymbols } from "./symbols";

const cache = new Map<string, SmartCSymbols>();

export function getSymbols(model: Monaco.editor.ITextModel): SmartCSymbols {
  return cache.get(model.uri.toString()) ?? emptySymbols();
}

const SmartCErrorPattern =
  /At line: (?<line>\d+):(?<column>\d+)\.\s+(?<message>.*)/;

export function updateModel(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
): void {
  const source = model.getValue();

  cache.set(model.uri.toString(), scanSymbols(source));

  const markers: Monaco.editor.IMarkerData[] = [];
  try {
    new SmartC({ language: "C", sourceCode: source }).compile();
  } catch (e: any) {
    const result = SmartCErrorPattern.exec(e.message ?? "");
    if (result?.groups) {
      const { line, column, message } = result.groups;
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message,
        startLineNumber: parseInt(line),
        startColumn: parseInt(column),
        endLineNumber: parseInt(line),
        endColumn: parseInt(column) + 1,
      });
    }
  }
  monaco.editor.setModelMarkers(model, "smartc", markers);
}

export function clearModel(model: Monaco.editor.ITextModel): void {
  cache.delete(model.uri.toString());
}
