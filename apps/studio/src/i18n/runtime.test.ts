import { afterEach, describe, expect, it } from "bun:test";
import {
  activeLocale,
  formatNumber,
  interpolate,
  rawMessage,
  resetMessages,
  setMessages,
  translate,
} from "./runtime";

afterEach(() => resetMessages());

const de = {
  common: {
    save: "Speichern",
    greet: "Hallo {name}",
    files: { one: "{count} Datei", other: "{count} Dateien" },
  },
};

const ru = {
  common: {
    files: { one: "{count} файл", few: "{count} файла", other: "{count} файлов" },
  },
};

describe("i18n runtime", () => {
  it("starts in English", () => {
    expect(activeLocale()).toBe("en");
  });

  it("returns the active locale's string", () => {
    setMessages("de", de);
    expect(translate("common.save")).toBe("Speichern");
    expect(activeLocale()).toBe("de");
  });

  it("falls back to the key when neither the locale nor English has it", () => {
    setMessages("de", de);
    expect(translate("common.nope")).toBe("common.nope");
  });

  it("interpolates named placeholders", () => {
    setMessages("de", de);
    expect(translate("common.greet", { name: "Ada" })).toBe("Hallo Ada");
  });

  it("leaves a placeholder visible when its parameter is missing", () => {
    setMessages("de", de);
    expect(translate("common.greet")).toBe("Hallo {name}");
  });

  it("does not treat a key path through a string as a match", () => {
    setMessages("de", de);
    expect(translate("common.save.deeper")).toBe("common.save.deeper");
  });

  it("selects the German plural category", () => {
    setMessages("de", de);
    expect(translate("common.files", { count: 1 })).toBe("1 Datei");
    expect(translate("common.files", { count: 3 })).toBe("3 Dateien");
  });

  it("selects the Russian few/many categories", () => {
    setMessages("ru", ru);
    expect(translate("common.files", { count: 1 })).toBe("1 файл");
    expect(translate("common.files", { count: 3 })).toBe("3 файла");
    // "many" is missing in this fixture: the locale's own "other" wins, not English.
    expect(translate("common.files", { count: 5 })).toBe("5 файлов");
  });

  it("uses other for a plural leaf called without count", () => {
    setMessages("de", de);
    expect(translate("common.files")).toBe("{count} Dateien");
  });

  it("exposes the selected template before interpolation", () => {
    setMessages("de", de);
    expect(rawMessage("common.greet", { name: "Ada" })).toBe("Hallo {name}");
    expect(rawMessage("common.nope")).toBeUndefined();
  });

  it("interpolate() ignores placeholders it has no value for", () => {
    expect(interpolate("{a} and {b}", { a: 1 })).toBe("1 and {b}");
  });

  it("formats numbers in the active locale", () => {
    setMessages("de", de);
    expect(formatNumber(1234.5)).toBe("1.234,5");
    resetMessages();
    expect(formatNumber(1234.5)).toBe("1,234.5");
  });
});
