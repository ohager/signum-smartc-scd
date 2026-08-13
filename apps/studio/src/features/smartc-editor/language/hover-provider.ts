import type * as Monaco from "monaco-editor";
import { SmartCKeywords } from "../language-definitions/keywords";
import { SmartCFunctions } from "../language-definitions/functions";
import { SmartCDirectives } from "../language-definitions/directives";
import { getSymbols } from "./symbol-cache";
import { getDebugMemory } from "./debug-memory";
import { matchDirectiveContext } from "./directive-context";

/**
 * If the hovered word is a struct member (`prefix.word`), build the compiler's
 * flattened name `prefix_word` (e.g. `currentTx.sender` → `currentTx_sender`),
 * so it can be matched against the debug memory. Returns null if not a member.
 */
function qualifiedMemberName(lineText: string, startColumn: number, word: string): string | null {
  // startColumn is 1-based; the char just before the word is at index startColumn - 2.
  let i = startColumn - 2;
  if (i < 0 || lineText[i] !== ".") return null;
  i--; // step before the dot
  const end = i;
  while (i >= 0 && /[A-Za-z0-9_]/.test(lineText[i])) i--;
  const prefix = lineText.slice(i + 1, end + 1);
  return prefix ? `${prefix}_${word}` : null;
}

/**
 * Documentation for `#program` / `#pragma` and their properties.
 *
 * `lineToWordEnd` is the line up to the end of the hovered word, which is what
 * lets the shared `matchDirectiveContext` classify the word under the cursor
 * rather than the word being typed.
 *
 * Returns `undefined` when this is not a directive line, so the caller keeps
 * looking; `null` when it is one but carries nothing worth showing (a value, or
 * a directive like `#define` that has no entry).
 */
function directiveHover(
  lineToWordEnd: string,
  word: string,
): Monaco.languages.Hover | null | undefined {
  const context = matchDirectiveContext(lineToWordEnd);
  if (!context) return undefined;
  if (context.kind === "value") return null;

  if (context.kind === "directive") {
    const info = SmartCDirectives[word as keyof typeof SmartCDirectives];
    if (!info) return null; // e.g. #define, #include
    return {
      contents: [
        { value: `\`#${word}\` — **${info.detail}**` },
        { value: info.documentation },
      ],
    };
  }

  const property = SmartCDirectives[context.directive].properties[word];
  if (!property) return null;
  return {
    contents: [
      { value: `\`#${context.directive} ${word}\` — **${property.detail}**` },
      { value: property.documentation },
    ],
  };
}

export function createHoverProvider(
  _monaco: typeof Monaco,
): Monaco.languages.HoverProvider {
  return {
    provideHover(model, position) {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // `#program` / `#pragma` lines are resolved first and never fall through:
      // `name` or `version` on a directive line is a property, not whatever
      // variable of the same name the file happens to declare.
      const lineText = model.getLineContent(position.lineNumber);
      const directive = directiveHover(
        lineText.slice(0, word.endColumn - 1),
        word.word,
      );
      if (directive !== undefined) return directive;

      // Live value from an active debug session (empty for non-debug models).
      // Handle struct-member access (`currentTx.sender` → `currentTx_sender`).
      const memory = getDebugMemory(model.uri.toString());
      const qualified = qualifiedMemberName(
        lineText,
        word.startColumn,
        word.word,
      );
      let debugName = word.word;
      let debugValue = memory?.[word.word];
      if (debugValue === undefined && qualified && memory?.[qualified] !== undefined) {
        debugName = qualified;
        debugValue = memory[qualified];
      }

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
        if (debugValue !== undefined) contents.push({ value: `**${debugName} = ${debugValue}**` });
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

      // Debug value for symbols the scanner didn't catch (e.g. struct members).
      if (debugValue !== undefined) {
        return { contents: [{ value: `**${debugName} = ${debugValue}**` }] };
      }
      return null;
    },
  };
}
