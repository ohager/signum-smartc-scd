import { describe, it, expect } from "bun:test";
import { CLIMATES, DEFAULT_CLIMATE, climateById, CLIMATE_IDS } from "./climates";

describe("climates", () => {
  it("offers exactly the four approved climates, in picker order", () => {
    expect(CLIMATE_IDS).toEqual(["nexus", "dawn", "solaris", "terminal"]);
  });

  it("starts on nexus", () => {
    expect(DEFAULT_CLIMATE).toBe("nexus");
  });

  it("gives every climate the colours Monaco needs", () => {
    for (const climate of CLIMATES) {
      for (const key of [
        "code",
        "gutter",
        "keyword",
        "type",
        "number",
        "comment",
        "string",
      ] as const) {
        expect(climate.editor[key]).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(climate.accent1).toMatch(/^#[0-9a-f]{6}$/);
      expect(climate.accent2).toMatch(/^#[0-9a-f]{6}$/);
      expect(climate.text).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("knows which climates are dark, because Monaco inherits from a base", () => {
    expect(climateById("dawn")!.base).toBe("vs");
    expect(climateById("nexus")!.base).toBe("vs-dark");
    expect(climateById("solaris")!.base).toBe("vs-dark");
    expect(climateById("terminal")!.base).toBe("vs-dark");
  });

  it("returns undefined for an id it does not know", () => {
    expect(climateById("aurora")).toBeUndefined();
  });
});
