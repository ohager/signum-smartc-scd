import { afterEach, describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import en from "./locales/en";
import enComplete from "./locales/en/complete";
import { compareLocale } from "./consistency";
import { formatNumber, resetMessages, setMessages, translate } from "./runtime";
import { LocaleSwitch } from "@/components/locale-switch";
import { startApp } from "@/start-app";

afterEach(() => resetMessages());

describe("byte counts", () => {
  it("show the count with the locale's grouping while the plural follows the number", () => {
    expect(translate("asm-editor.meta.bytes", { count: 10240, n: formatNumber(10240) })).toBe("10,240 bytes");
    expect(translate("asm-editor.meta.bytes", { count: 1, n: formatNumber(1) })).toBe("1 byte");
  });
});

describe("the boot chunk", () => {
  it("does not carry the English editor documentation, which is never read at runtime", () => {
    expect("editor-docs" in en).toBe(false);
  });

  it("keeps the complete English tree for tooling", () => {
    expect("editor-docs" in enComplete).toBe(true);
    expect(enComplete.common).toBe(en.common);
  });
});

describe("the locale picker", () => {
  it("says what it is, not only which language is active", () => {
    expect(renderToStaticMarkup(<LocaleSwitch />)).toContain('aria-label="Language: English"');
  });
});

describe("plural categories", () => {
  const source = { a: { files: { one: "{count} file", other: "{count} files" } } };

  it("fails a Russian plural without few", () => {
    const ru = { a: { files: { one: "{count} файл", many: "{count} файлов", other: "{count} файла" } } };
    expect(compareLocale(source, ru, "ru").plural).toEqual(["a.files"]);
  });

  it("accepts a French plural without the millions-only many", () => {
    const fr = { a: { files: { one: "{count} fichier", other: "{count} fichiers" } } };
    expect(compareLocale(source, fr, "fr").plural).toEqual([]);
  });
});

describe("an app chunk that fails to load", () => {
  it("replaces the splash with a message and a reload button", async () => {
    const root = { innerHTML: '<div class="studio-splash"></div>' } as unknown as HTMLElement;
    const error = console.error;
    console.error = () => {};
    await startApp({ root, importApp: () => Promise.reject(new Error("404")), render: () => {} });
    console.error = error;
    expect(root.innerHTML).toContain("Studio could not be loaded");
    expect(root.innerHTML).toContain("<button");
    expect(root.innerHTML).not.toContain("studio-splash");
  });
});
