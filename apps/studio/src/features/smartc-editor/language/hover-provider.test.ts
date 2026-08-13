import { describe, it, expect } from "bun:test";
import type * as Monaco from "monaco-editor";
import { createHoverProvider } from "./hover-provider";

/** Hovers the word at `column` (1-based) on a single-line model. */
function hoverAt(line: string, column: number) {
  const provider = createHoverProvider({} as unknown as typeof Monaco);
  const model = {
    uri: { toString: () => "inmemory://test.smart.c" },
    getLineContent: () => line,
    getWordAtPosition: () => {
      // Mirrors monaco's default word definition closely enough for these cases.
      for (const m of line.matchAll(/\w+/g)) {
        const start = m.index + 1;
        const end = start + m[0].length;
        if (column >= start && column < end) {
          return { word: m[0], startColumn: start, endColumn: end };
        }
      }
      return null;
    },
  } as unknown as Monaco.editor.ITextModel;

  return provider.provideHover(
    model,
    { lineNumber: 1, column } as Monaco.Position,
    undefined as unknown as Monaco.CancellationToken,
    undefined as unknown as Monaco.languages.HoverContext<Monaco.languages.Hover>,
  ) as Monaco.languages.Hover | null;
}

/** Column of the first character of `needle` in `line`, 1-based. */
const columnOf = (line: string, needle: string) => line.indexOf(needle) + 1;

const textOf = (hover: Monaco.languages.Hover | null) =>
  (hover?.contents ?? []).map((c) => c.value).join("\n\n");

describe("directive hover", () => {
  it("documents the #program directive itself", () => {
    const line = "#program name MyContract";
    const text = textOf(hoverAt(line, columnOf(line, "program")));
    expect(text).toContain("`#program`");
    expect(text).toContain("Contract metadata");
  });

  it("documents the #pragma directive itself", () => {
    const line = "#pragma maxAuxVars 5";
    const text = textOf(hoverAt(line, columnOf(line, "pragma")));
    expect(text).toContain("`#pragma`");
    expect(text).toContain("Compiler options");
  });

  it("documents a #program property", () => {
    const line = "#program activationAmount 0.1";
    const text = textOf(hoverAt(line, columnOf(line, "activationAmount")));
    expect(text).toContain("`#program activationAmount`");
    expect(text).toContain("mandatory for deployment");
  });

  it("documents a #pragma property", () => {
    const line = "#pragma optimizationLevel 3";
    const text = textOf(hoverAt(line, columnOf(line, "optimizationLevel")));
    expect(text).toContain("`#pragma optimizationLevel`");
    expect(text).toContain("Choose strategy for code optimizer");
  });

  it("tolerates indentation and spacing after the hash", () => {
    const line = "  # pragma  verboseAssembly true";
    const text = textOf(hoverAt(line, columnOf(line, "verboseAssembly")));
    expect(text).toContain("Adds a comment in assembly output");
  });

  it("shows nothing for the value part of a directive", () => {
    const line = "#program name MyContract";
    expect(hoverAt(line, columnOf(line, "MyContract"))).toBeNull();
  });

  it("shows nothing for an unknown property", () => {
    const line = "#program nonsense 1";
    expect(hoverAt(line, columnOf(line, "nonsense"))).toBeNull();
  });

  it("does not claim directives it has no docs for", () => {
    const line = "#define MAX 10";
    expect(hoverAt(line, columnOf(line, "define"))).toBeNull();
  });

  it("still documents built-ins in regular code", () => {
    const line = "long a = getNextTx();";
    const text = textOf(hoverAt(line, columnOf(line, "getNextTx")));
    expect(text).toContain("SmartC Function");
  });

  it("does not treat a property name in regular code as a directive", () => {
    // `version` is a #pragma property, but here it is an ordinary identifier.
    const line = "long version = 2;";
    const text = textOf(hoverAt(line, columnOf(line, "version")));
    expect(text).not.toContain("#pragma");
  });
});
