import { describe, it, expect } from "bun:test";
import type * as Monaco from "monaco-editor";
import { createAsmHoverProvider } from "./hover-provider";
import { matchAsmDirectiveTarget } from "./directive-target";

function hoverAt(line: string, column: number) {
  const provider = createAsmHoverProvider();
  const model = {
    getLineContent: () => line,
    getWordAtPosition: () => {
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

const columnOf = (line: string, needle: string) => line.indexOf(needle) + 1;

const textOf = (hover: Monaco.languages.Hover | null) =>
  (hover?.contents ?? []).map((c) => c.value).join("\n\n");

describe("matchAsmDirectiveTarget", () => {
  it("finds the directive name", () => {
    expect(matchAsmDirectiveTarget("^program name X", 2)).toEqual({
      kind: "directive",
      name: "program",
    });
  });

  it("finds the property name", () => {
    expect(matchAsmDirectiveTarget("^program name X", 10)).toEqual({
      kind: "property",
      directive: "program",
      name: "name",
    });
  });

  it("handles indentation", () => {
    const line = "   ^declare myVar";
    expect(matchAsmDirectiveTarget(line, 5)).toEqual({
      kind: "directive",
      name: "declare",
    });
  });

  it("ignores the value and non-directive lines", () => {
    expect(matchAsmDirectiveTarget("^program name X", 15)).toBeNull();
    expect(matchAsmDirectiveTarget("SET @a $b", 1)).toBeNull();
  });
});

describe("asm hover", () => {
  it("documents an opcode with its forms table", () => {
    const line = "BZR $r0 :__if1_endif";
    const text = textOf(hoverAt(line, columnOf(line, "BZR")));
    expect(text).toContain("**BZR** — Branch if zero");
    expect(text).toContain("Program flow · 1 step");
    expect(text).toContain("`BZR $var :label`");
    expect(text).toContain("`0x1b`");
  });

  it("lists every form of a multi-form opcode", () => {
    const text = textOf(hoverAt("SET @a $b", 1));
    // SET_VAL, SET_DAT, SET_IND, SET_IDX, IND_DAT, IDX_DAT
    expect(text).toContain("`0x01`");
    expect(text).toContain("`0x02`");
    expect(text).toContain("`0x0e`");
    expect(text).toContain("`0x0f`");
    expect(text).toContain("`0x14`");
    expect(text).toContain("`0x15`");
  });

  it("flags the higher step fee on FUN", () => {
    const text = textOf(hoverAt("FUN @r0 get_Current_Balance", 1));
    expect(text).toContain("API · 10 steps");
  });

  it("documents API function names", () => {
    const line = "FUN @r0 get_Current_Balance";
    const text = textOf(hoverAt(line, columnOf(line, "get_Current_Balance")));
    expect(text).toContain("**get_Current_Balance** — API function");
    expect(text).toContain("`0x0400`"); // api code
  });

  it("documents assembler directives and their properties", () => {
    const line = "^program activationAmount 3400_0000";
    expect(textOf(hoverAt(line, columnOf(line, "program")))).toContain(
      "**^program**",
    );
    const property = textOf(hoverAt(line, columnOf(line, "activationAmount")));
    expect(property).toContain("**^program activationAmount**");
    expect(property).toContain("mandatory for deployment");
  });

  it("documents ^declare", () => {
    const line = "^declare myVar";
    expect(textOf(hoverAt(line, columnOf(line, "declare")))).toContain(
      "reserves one 64-bit memory cell",
    );
  });

  it("shows nothing for labels, variables and unknown words", () => {
    expect(hoverAt("__if1_endif:", 1)).toBeNull();
    expect(hoverAt("SET @myVar $other", columnOf("SET @myVar $other", "myVar"))).toBeNull();
  });

  it("does not mistake a directive value for an opcode", () => {
    // `SET` here is part of the ^const syntax, and `myVar` is just a name.
    const line = "^const SET @myVar #0000000000000001";
    expect(hoverAt(line, columnOf(line, "myVar"))).toBeNull();
  });
});
