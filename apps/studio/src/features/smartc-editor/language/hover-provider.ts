import type * as Monaco from "monaco-editor";
import { SmartCKeywords } from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";
import { getSymbols } from "./symbol-cache";
import { getDebugMemory } from "./debug-memory";

export function createHoverProvider(
  _monaco: typeof Monaco,
): Monaco.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // Live value from an active debug session (empty for non-debug models).
      const debugValue = getDebugMemory(model.uri.toString())?.[word.word];

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
      if (v) {
        const contents: { value: string }[] = [];
        if (debugValue !== undefined) contents.push({ value: `**${v.name} = ${debugValue}**` });
        contents.push({
          value: `\`${v.declaration}${v.isPointer ? " *" : ""} ${v.name}\` — SmartC variable (line ${v.line})`,
        });
        return { contents };
      }
      const m = sym.macros.find((x) => x.name === word.word);
      if (m)
        return {
          contents: [
            {
              value: `\`#define ${m.name}${m.params ? `(${m.params.join(", ")})` : ""}\`${m.value ? ` → \`${m.value}\`` : ""}`,
            },
          ],
        };
      const f = sym.functions.find((x) => x.name === word.word);
      if (f)
        return {
          contents: [
            {
              value: `\`${f.returnType} ${f.name}(${f.params.map((p) => `${p.type} ${p.name}`).join(", ")})\` — SmartC function`,
            },
          ],
        };

      // Debug value for a symbol the scanner didn't catch (e.g. compiler-named).
      if (debugValue !== undefined) {
        return { contents: [{ value: `**${word.word} = ${debugValue}**` }] };
      }
      return null;
    },
  };
}
