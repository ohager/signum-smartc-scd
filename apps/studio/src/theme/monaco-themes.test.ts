import { describe, it, expect } from "bun:test";
import { climateById } from "./climates";
import {
  asmThemeName,
  buildAsmTheme,
  buildSmartcTheme,
  smartcThemeName,
} from "./monaco-themes";

const nexus = climateById("nexus")!;
const dawn = climateById("dawn")!;

describe("monaco theme names", () => {
  it("names a theme after its climate", () => {
    expect(smartcThemeName("nexus")).toBe("smartc-nexus");
    expect(asmThemeName("terminal")).toBe("asm-terminal");
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
    expect(buildSmartcTheme(nexus).colors["editor.lineHighlightBackground"]).toBe(
      "#00aaff1a",
    );
  });

  it("colours keywords and comments from the climate", () => {
    const rules = buildSmartcTheme(nexus).rules;
    expect(rules.find((r) => r.token === "keyword")!.foreground).toBe("#5aa7ff");
    expect(rules.find((r) => r.token === "comment")!.foreground).toBe("#3d4d68");
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
