import { describe, it, expect } from "bun:test";
import { climateById } from "./climates";
import {
  asmThemeName,
  buildAsmTheme,
  buildJsonTheme,
  buildSmartcTheme,
  jsonThemeName,
  smartcThemeName,
} from "./monaco-themes";

const nexus = climateById("nexus")!;
const dawn = climateById("dawn")!;

describe("monaco theme names", () => {
  it("names a theme after its climate", () => {
    expect(smartcThemeName("nexus")).toBe("smartc-nexus");
    expect(asmThemeName("terminal")).toBe("asm-terminal");
    expect(jsonThemeName("solaris")).toBe("json-solaris");
  });
});

describe("buildSmartcTheme", () => {
  it("paints the editor ground from the climate, not from Monaco's base", () => {
    expect(buildSmartcTheme(nexus).colors["editor.background"]).toBe("#0a0f1c");
    expect(buildSmartcTheme(dawn).colors["editor.background"]).toBe("#f7f9ff");
  });

  it("inherits from the light base in the light climate", () => {
    expect(buildSmartcTheme(dawn).base).toBe("vs");
    expect(buildSmartcTheme(nexus).base).toBe("vs-dark");
  });

  it("tints the active line with the accent, as eight-digit hex", () => {
    // Monaco takes alpha as two trailing hex digits; 0x1a is the 10% the spec asks for.
    expect(
      buildSmartcTheme(nexus).colors["editor.lineHighlightBackground"],
    ).toBe("#00aaff1a");
  });

  it("colours keywords and comments from the climate", () => {
    const rules = buildSmartcTheme(nexus).rules;
    expect(rules.find((r) => r.token === "keyword")!.foreground).toBe(
      "#5aa7ff",
    );
    expect(rules.find((r) => r.token === "comment")!.foreground).toBe(
      "#3d4d68",
    );
  });
});

describe("buildAsmTheme", () => {
  it("shares the climate's ground with the SmartC theme", () => {
    expect(buildAsmTheme(nexus).colors["editor.background"]).toBe(
      buildSmartcTheme(nexus).colors["editor.background"],
    );
  });

  it("keeps the assembly token roles the ASM grammar emits", () => {
    const tokens = buildAsmTheme(nexus).rules.map((r) => r.token);
    for (const token of [
      "keyword.control",
      "keyword.stack",
      "keyword.operator",
      "keyword.api",
      "keyword.memory",
      "directive",
      "preprocessor",
      "label",
      "variable.register",
    ]) {
      expect(tokens).toContain(token);
    }
  });
});

describe("buildJsonTheme", () => {
  it("shares the climate's ground with the other grammars", () => {
    expect(buildJsonTheme(nexus).colors["editor.background"]).toBe(
      buildSmartcTheme(nexus).colors["editor.background"],
    );
  });

  /**
   * The bug this theme exists for. Monaco picks the rule whose token is the
   * longest prefix of the real one, so under the SmartC set both
   * `string.key.json` and `string.value.json` fell through to `string` and a
   * scenario read as one flat colour.
   */
  it("tells a key apart from a value", () => {
    const rules = buildJsonTheme(nexus).rules;
    const key = rules.find((r) => r.token === "string.key.json")!.foreground;
    const value = rules.find(
      (r) => r.token === "string.value.json",
    )!.foreground;

    expect(key).not.toBe(value);
    expect(key).toBe(nexus.editor.type);
    expect(value).toBe(nexus.editor.string);
  });

  it("takes every colour from the climate in every climate", () => {
    for (const climate of [nexus, dawn]) {
      const theme = buildJsonTheme(climate);
      const used = theme.rules.map((rule) => rule.foreground);
      const owned = Object.values(climate.editor);

      for (const colour of used) expect(owned).toContain(colour!);
    }
  });
});
