import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { activate, resolveLocale } from "./boot";
import type { LocaleEntry, LocaleId } from "./locales";
import { activeLocale, resetMessages, translate } from "./runtime";

afterEach(() => resetMessages());

const ALL: LocaleId[] = ["en", "de", "pt-BR", "fr", "es", "it", "uk", "ru", "zh-CN"];

describe("resolveLocale", () => {
  it("prefers a stored locale that is available", () => {
    expect(resolveLocale("de", ["fr-FR"], ALL)).toBe("de");
  });

  it("ignores a stored locale that is not (or no longer) available", () => {
    expect(resolveLocale("fr", ["de-DE"], ["en", "de"])).toBe("de");
    expect(resolveLocale("garbage", [], ALL)).toBe("en");
  });

  it("matches browser languages exactly, then by language", () => {
    expect(resolveLocale(null, ["pt-BR"], ALL)).toBe("pt-BR");
    expect(resolveLocale(null, ["pt-PT"], ALL)).toBe("pt-BR");
    expect(resolveLocale(null, ["zh-TW"], ALL)).toBe("zh-CN");
    expect(resolveLocale(null, ["de-AT", "en"], ALL)).toBe("de");
    expect(resolveLocale(null, ["ZH-cn"], ALL)).toBe("zh-CN");
  });

  it("walks the browser list in order", () => {
    expect(resolveLocale(null, ["nl", "ru"], ALL)).toBe("ru");
  });

  it("falls back to English", () => {
    expect(resolveLocale(null, ["nl", "ja"], ALL)).toBe("en");
    expect(resolveLocale(null, [], ALL)).toBe("en");
  });
});

describe("activate", () => {
  const de: LocaleEntry = {
    id: "de",
    nativeLabel: "Deutsch",
    load: async () => ({ default: { common: { hi: "Hallo" } } }),
  };

  it("loads the locale and sets the document language", async () => {
    const root = { lang: "en" };
    expect(await activate("de", [de], root)).toBe("de");
    expect(activeLocale()).toBe("de");
    expect(translate("common.hi")).toBe("Hallo");
    expect(root.lang).toBe("de");
  });

  it("continues in English when the chunk fails to load", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const broken: LocaleEntry = { ...de, load: () => Promise.reject(new Error("offline")) };
    const root = { lang: "en" };
    expect(await activate("de", [broken], root)).toBe("en");
    expect(activeLocale()).toBe("en");
    expect(root.lang).toBe("en");
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("treats an unlisted locale as English", async () => {
    const root = { lang: "x" };
    expect(await activate("fr", [de], root)).toBe("en");
    expect(root.lang).toBe("en");
  });
});
