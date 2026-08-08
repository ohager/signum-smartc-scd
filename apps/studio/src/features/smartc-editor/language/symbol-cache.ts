import type * as Monaco from "monaco-editor";
import { SmartC } from "smartc-signum-compiler";

const SmartCErrorPattern =
  /At line: (?<line>\d+):(?<column>\d+)\.\s+(?<message>.*)/;

export function updateModel(
  monaco: typeof Monaco,
  model: Monaco.editor.ITextModel,
): void {
  const source = model.getValue();
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
  model; // no cache yet; extended in Slice 2
}
