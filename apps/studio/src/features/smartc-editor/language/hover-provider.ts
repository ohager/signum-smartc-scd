import type * as Monaco from "monaco-editor";
import { SmartCKeywords } from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";

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
      return null;
    },
  };
}
