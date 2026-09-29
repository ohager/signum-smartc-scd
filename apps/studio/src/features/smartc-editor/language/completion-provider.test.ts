import { describe, it, expect } from "bun:test";
import type * as Monaco from "monaco-editor";
import { createCompletionProvider } from "./completion-provider";

/** Only the enums the provider reads are needed — no monaco runtime in tests. */
const monacoStub = {
  languages: {
    CompletionItemKind: {
      Keyword: 17,
      Property: 9,
      Function: 1,
      Variable: 4,
      Constant: 14,
      Struct: 22,
    },
    CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    CompletionTriggerKind: {
      Invoke: 0,
      TriggerCharacter: 1,
      TriggerForIncompleteCompletions: 2,
    },
  },
} as unknown as typeof Monaco;

/** Completes at the end of `line`; `source` is the whole file (defaults to just `line`). */
function completeAt(line: string, triggerCharacter?: string, source = line) {
  const provider = createCompletionProvider(monacoStub);
  const column = line.length + 1;
  const wordMatch = /\w*$/.exec(line)![0];
  const model = {
    uri: { toString: () => "inmemory://test.smart.c" },
    getWordUntilPosition: () => ({
      word: wordMatch,
      startColumn: column - wordMatch.length,
      endColumn: column,
    }),
    getValueInRange: () => line,
    getValue: () => source,
  } as unknown as Monaco.editor.ITextModel;
  const position = { lineNumber: 1, column } as Monaco.Position;
  const context = {
    triggerKind: triggerCharacter ? 1 : 0,
    triggerCharacter,
  } as Monaco.languages.CompletionContext;

  const result = provider.provideCompletionItems(
    model,
    position,
    context,
    undefined as unknown as Monaco.CancellationToken,
  ) as Monaco.languages.CompletionList;
  return result.suggestions;
}

describe("directive completion", () => {
  it("suggests the directives after '#' and overwrites the '#'", () => {
    const items = completeAt("#", "#");
    expect(items.map((i) => i.label)).toEqual(["#program", "#pragma", "#include"]);
    expect(items[0].range).toMatchObject({ startColumn: 1, endColumn: 2 });
    // Accepting the directive immediately opens the property list.
    expect(items[0].command?.id).toBe("editor.action.triggerSuggest");
  });

  it("suggests #program properties with mandatory ones first", () => {
    const items = completeAt("#program ", " ");
    expect(items.map((i) => i.label)).toEqual([
      "name",
      "description",
      "activationAmount",
      "codeHashId",
      "codeStackPages",
      "userStackPages",
      "creator",
      "contract",
    ]);
    const name = items[0];
    expect(name.insertText).toBe("name ${1:MyContract}");
    expect(name.insertTextRules).toBe(4); // InsertAsSnippet
    expect(name.detail).toContain("mandatory");
  });

  it("suggests #pragma properties with value snippets", () => {
    const items = completeAt("#pragma ", " ");
    expect(items.map((i) => i.label)).toEqual([
      "maxAuxVars",
      "maxConstVars",
      "optimizationLevel",
      "reuseAssignedVar",
      "verboseAssembly",
      "verboseScope",
      "version",
    ]);
    const byName = Object.fromEntries(items.map((i) => [i.label as string, i]));
    expect(byName["maxAuxVars"].insertText).toBe("maxAuxVars ${1:3}");
    expect(byName["verboseAssembly"].insertText).toBe(
      "verboseAssembly ${1|true,false|}",
    );
    // Snippet placeholders must replace only the partially typed property name.
    expect(byName["maxAuxVars"].range).toMatchObject({
      startColumn: 9,
      endColumn: 9,
    });
  });

  it("filters properties on the partially typed name via the word range", () => {
    const items = completeAt("#pragma max");
    expect(items.map((i) => i.label)).toContain("maxAuxVars");
    expect(items[0].range).toMatchObject({ startColumn: 9, endColumn: 12 });
  });

  it("suggests the two API tables after #include, with no value snippet", () => {
    const items = completeAt("#include ", " ");
    expect(items.map((i) => i.label)).toEqual(["APIFunctions", "fixedAPIFunctions"]);
    expect(items[0].insertText).toBe("APIFunctions");
    expect(items[0].insertTextRules).toBeUndefined();
  });

  it("suggests nothing inside a directive value", () => {
    expect(completeAt("#program name MyContr")).toEqual([]);
    expect(completeAt("#pragma maxAuxVars 3")).toEqual([]);
  });

  it("does not pop up the symbol list when space is typed in code", () => {
    expect(completeAt("long a = ", " ")).toEqual([]);
  });

  it("still offers keywords and built-ins in regular code", () => {
    const labels = completeAt("getNext").map((i) => i.label);
    expect(labels).toContain("getNextTx");
    expect(labels).toContain("sleep");
  });
});

describe("low-level API completion", () => {
  const labelsFor = (source: string) =>
    completeAt("Get_", undefined, source).map((i) => i.label);

  it("hides the API functions until the file includes them", () => {
    expect(labelsFor("Get_")).not.toContain("Get_A1");
  });

  it("offers them once #include APIFunctions is present", () => {
    const labels = labelsFor("#include APIFunctions\nGet_");
    expect(labels).toContain("Get_A1");
    expect(labels).toContain("Set_A1_A2");
    expect(labels).not.toContain("F_Get_A1");
  });

  it("offers the F_ variants only with #include fixedAPIFunctions", () => {
    const labels = labelsFor("#include fixedAPIFunctions\nGet_");
    expect(labels).toContain("F_Get_A1");
    expect(labels).not.toContain("Get_A1");
  });

  it("inserts a snippet with one placeholder per argument", () => {
    const item = completeAt("Set_", undefined, "#include APIFunctions\nSet_").find(
      (i) => i.label === "Set_A1_A2",
    )!;
    expect(item.insertText).toBe("Set_A1_A2(${1:a1}, ${2:a2})");
    expect(item.detail).toContain("#include APIFunctions");
  });
});
