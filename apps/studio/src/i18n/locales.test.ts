import { describe, expect, it } from "bun:test";
import en from "./locales/en";
import { compareLocale, loadLocaleDirs } from "./consistency";
import { LOCALES } from "./locales";

const dirs = await loadLocaleDirs();

describe("locale files", () => {
  it("every LOCALES entry has a folder", () => {
    for (const l of LOCALES) expect(dirs.has(l.id)).toBe(true);
  });

  for (const [id, messages] of dirs) {
    if (id === "en") continue;
    it(`${id} matches English's keys, placeholders, tags and code`, () => {
      const p = compareLocale(en, messages);
      if (p.missing.length) console.info(`[i18n] ${id}: ${p.missing.length} keys fall back to English`);
      expect({ ...p, missing: [] }).toEqual({ extra: [], placeholders: [], tags: [], code: [], plural: [], missing: [] });
    });
  }
});
