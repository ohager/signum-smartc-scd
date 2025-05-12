import type * as Monaco from "monaco-editor";
import { SmartCKeywords } from "./keywords.ts";
import { SmartCFunctions } from "./functions.ts";
import { SmartC } from "smartc-signum-compiler";

// so, monaco is a global instance apparently and though we need to avoid multiple extensions
let hasExtendedAlready = false;
const SmartCErrorPattern =
  /At line: (?<line>\d+):(?<column>\d+)\.\s+(?<message>.*)/;




export function extendCLangWithSmartC(monaco: typeof Monaco) {

  if (hasExtendedAlready) return;
  hasExtendedAlready = true;

  const validateModel = (model: Monaco.editor.ITextModel) => {
    if (model.getLanguageId() !== "c") {
      return;
    }

    const markers: Monaco.editor.IMarkerData[] = [];
    const sourceCode = model.getValue();
    try {
      const compiler = new SmartC({ language: "C", sourceCode });
      compiler.compile();
    } catch (e) {
      const result = SmartCErrorPattern.exec(e.message);
      if (result) {
        // @ts-ignore
        const { line, column, message } = result.groups;
        console.log(line, column, message);
        markers.push({
          severity: monaco.MarkerSeverity.Error,
          message: message,
          startLineNumber: parseInt(line),
          startColumn: parseInt(column),
          endLineNumber: parseInt(line),
          endColumn: parseInt(column),
        });
      }
    }
    monaco.editor.setModelMarkers(model, "smartc", markers);
  }

    // Process any existing models that might have been created before the listener was registered
  let diagnosticsTimeout: NodeJS.Timer | null = null;
  monaco.editor.getModels().forEach(model => {
    if (model.getLanguageId() === "c") {
      // Apply the same setup logic you have in your onDidCreateModel handler
      model.onDidChangeContent(() => {
        if (diagnosticsTimeout) {
          clearTimeout(diagnosticsTimeout);
        }
        diagnosticsTimeout = setTimeout(() => validateModel(model), 500);
      });
      validateModel(model);
    }
  });


  // monaco.editor.onDidCreateModel((model) => {
  //   validateModel(model)
  // });

  monaco.languages.registerCompletionItemProvider("c", {
    provideCompletionItems: (
      model,
      position,
    ): Monaco.languages.ProviderResult<Monaco.languages.CompletionList> => {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };

      // SmartC-specific keywords suggestions
      const keywordSuggestions = Object.entries(SmartCKeywords).map(
        ([keyword, info]) =>
          ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            detail: info.detail,
            documentation: info.documentation,
            range,
          }) as Monaco.languages.CompletionItem,
      );

      const functionSuggestions = Object.entries(SmartCFunctions).map(
        ([funcName, info]) => {
          // Create snippet with parameter placeholders
          let snippetText = funcName + "(";

          if (info.params && info.params.length > 0) {
            snippetText += info.params
              .map((param, index) => `\${${index + 1}:${param.name}}`)
              .join(", ");
          }

          snippetText += ")";

          return {
            label: funcName,
            kind: monaco.languages.CompletionItemKind.Function,
            detail: info.detail,
            documentation: {
              value: info.documentation,
              isTrusted: true,
            },
            insertText: snippetText,
            insertTextRules:
              monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range,
          };
        },
      );

      return { suggestions: [...keywordSuggestions, ...functionSuggestions] };
    },
  });

  monaco.languages.registerHoverProvider("c", {
    provideHover: (model, position) => {
      const word = model.getWordAtPosition(position);
      if (!word) return null;

      // Check for SmartC function documentation
      const functionContent = SmartCFunctions[word.word];
      if (functionContent) {
        return {
          contents: [
            { value: `\`${functionContent.signature}\` - **SmartC Function**` },
            { value: functionContent.documentation },
          ],
        };
      }

      // Check for SmartC keyword documentation
      const keywordContent = SmartCKeywords[word.word];
      if (keywordContent) {
        return {
          contents: [
            { value: `\`${word.word}\` - **SmartC Keyword**` },
            { value: keywordContent.documentation },
          ],
        };
      }

      return null;
    },
  });

  monaco.languages.registerSignatureHelpProvider("c", {
    signatureHelpTriggerCharacters: ["(", ","],

    provideSignatureHelp: (model, position) => {
      // Find if we're inside a function call
      const textUntilPosition = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });

      // Find balanced parentheses to determine if we're inside a function call
      let parenthesesCount = 0;
      let lastOpenParenIndex = -1;

      for (let i = textUntilPosition.length - 1; i >= 0; i--) {
        if (textUntilPosition[i] === ")") {
          parenthesesCount++;
        } else if (textUntilPosition[i] === "(") {
          parenthesesCount--;
          if (parenthesesCount < 0) {
            lastOpenParenIndex = i;
            break;
          }
        }
      }

      if (lastOpenParenIndex === -1) return null;

      // Extract the function name
      let functionName = "";
      for (let i = lastOpenParenIndex - 1; i >= 0; i--) {
        const char = textUntilPosition[i];
        if (/[a-zA-Z0-9_]/.test(char)) {
          functionName = char + functionName;
        } else {
          break;
        }
      }

      const functionInfo = SmartCFunctions[functionName];
      if (!functionInfo) return null;

      // Count commas to determine which parameter we're on
      // Only count commas after the opening parenthesis of our current function call
      const relevantText = textUntilPosition.substring(lastOpenParenIndex + 1);
      let commaCount = 0;
      let inString = false;
      let stringChar = "";
      let nestedParentheses = 0;

      for (let i = 0; i < relevantText.length; i++) {
        const char = relevantText[i];

        if (inString) {
          if (char === stringChar && relevantText[i - 1] !== "\\") {
            inString = false;
          }
          continue;
        }

        if (char === '"' || char === "'") {
          inString = true;
          stringChar = char;
        } else if (char === "(") {
          nestedParentheses++;
        } else if (char === ")") {
          nestedParentheses--;
        } else if (char === "," && nestedParentheses === 0) {
          commaCount++;
        }
      }

      // Create signature information
      const signatureInformation: Monaco.languages.SignatureInformation = {
        label: functionInfo.signature,
        documentation: {
          value: functionInfo.documentation,
          isTrusted: true,
        },
        parameters: functionInfo.params.map((param) => ({
          label: param.name,
          documentation: {
            value: param.documentation,
            isTrusted: true,
          },
        })),
      };

      return {
        value: {
          signatures: [signatureInformation],
          activeSignature: 0,
          activeParameter: Math.min(commaCount, functionInfo.params.length - 1),
        },
        dispose: () => {},
      };
    },
  });
}
