import type * as Monaco from "monaco-editor";
import { SmartCKeywords } from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";
import { getSymbols } from "./symbol-cache";

export function createHoverProvider(
  _monaco: typeof Monaco,
): Monaco.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      const fn = SmartCFunctions[word.word];
      if (fn) {
        return {
          contents: [
            { value: `\`${fn.signature}\` - **SmartC Function**` },
            { value: fn.documentation },
          ],
        };
      }
      const kw = SmartCKeywords[word.word];
      if (kw) {
        return {
          contents: [
            { value: `\`${word.word}\` - **SmartC Keyword**` },
            { value: kw.documentation },
          ],
        };
      }
      const sym = getSymbols(model);
      const v = sym.variables.find((x) => x.name === word.word);
      if (v) return { contents: [{ value: `\`${v.declaration}${v.isPointer ? " *" : ""} ${v.name}\` — SmartC variable (line ${v.line})` }] };
      const m = sym.macros.find((x) => x.name === word.word);
      if (m) return { contents: [{ value: `\`#define ${m.name}${m.params ? `(${m.params.join(", ")})` : ""}\`${m.value ? ` → \`${m.value}\`` : ""}` }] };
      const f = sym.functions.find((x) => x.name === word.word);
      if (f) return { contents: [{ value: `\`${f.returnType} ${f.name}(${f.params.map((p) => `${p.type} ${p.name}`).join(", ")})\` — SmartC function` }] };
      return null;
    },
  };
}
