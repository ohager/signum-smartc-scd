import type * as Monaco from "monaco-editor";
import { SmartCFunctions } from "../language-definitions/functions";

/** Finds the innermost function call name and active parameter index at `textUntilPosition`. */
export function findActiveCall(
  textUntilPosition: string,
): { name: string; activeParameter: number } | null {
  let depth = 0;
  let open = -1;
  for (let i = textUntilPosition.length - 1; i >= 0; i--) {
    const ch = textUntilPosition[i];
    if (ch === ")") depth++;
    else if (ch === "(") {
      depth--;
      if (depth < 0) {
        open = i;
        break;
      }
    }
  }
  if (open === -1) return null;

  let name = "";
  for (let i = open - 1; i >= 0; i--) {
    const ch = textUntilPosition[i];
    if (/[a-zA-Z0-9_]/.test(ch)) name = ch + name;
    else break;
  }
  if (!name) return null;

  const rel = textUntilPosition.substring(open + 1);
  let commas = 0;
  let nested = 0;
  let inStr = false;
  let strCh = "";
  for (let i = 0; i < rel.length; i++) {
    const ch = rel[i];
    if (inStr) {
      if (ch === strCh && rel[i - 1] !== "\\") inStr = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inStr = true;
      strCh = ch;
    } else if (ch === "(") nested++;
    else if (ch === ")") nested--;
    else if (ch === "," && nested === 0) commas++;
  }
  return { name, activeParameter: commas };
}

export function createSignatureHelpProvider(
  _monaco: typeof Monaco,
): Monaco.languages.SignatureHelpProvider {
  return {
    signatureHelpTriggerCharacters: ["(", ","],
    provideSignatureHelp(model, position) {
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const call = findActiveCall(textUntilPosition);
      if (!call) return null;

      const info = SmartCFunctions[call.name];
      if (!info) return null;

      const signature: Monaco.languages.SignatureInformation = {
        label: info.signature,
        documentation: { value: info.documentation, isTrusted: true },
        parameters: info.params.map((p) => ({
          label: p.name,
          documentation: { value: p.documentation, isTrusted: true },
        })),
      };
      return {
        value: {
          signatures: [signature],
          activeSignature: 0,
          activeParameter: Math.min(call.activeParameter, info.params.length - 1),
        },
        dispose: () => {},
      };
    },
  };
}
