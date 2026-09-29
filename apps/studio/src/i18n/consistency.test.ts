import { describe, expect, it } from "bun:test";
import { compareLocale } from "./consistency";

const en = {
  a: {
    hi: "Hello {name}",
    link: "See the <link>manual</link>",
    api: "Calls `Get_A1` first",
    files: { one: "{count} file", other: "{count} files" },
    only: "Only in English",
  },
};

describe("compareLocale", () => {
  it("passes a faithful translation and reports missing keys", () => {
    const de = {
      a: {
        hi: "Hallo {name}",
        link: "Siehe <link>Handbuch</link>",
        api: "Ruft zuerst `Get_A1` auf",
        files: { one: "{count} Datei", other: "{count} Dateien" },
      },
    };
    const p = compareLocale(en, de);
    expect(p).toEqual({ extra: [], placeholders: [], tags: [], code: [], plural: [], missing: ["a.only"] });
  });

  it("flags extra keys, changed placeholders, tags and code spans", () => {
    const bad = {
      a: {
        hi: "Hallo {nom}",
        link: "Siehe <a>Handbuch</a>",
        api: "Ruft zuerst `Hole_A1` auf",
        files: { one: "{count} Datei" },
        typo: "x",
      },
    };
    const p = compareLocale(en, bad);
    expect(p.extra).toEqual(["a.typo"]);
    expect(p.placeholders).toEqual(["a.hi"]);
    expect(p.tags).toEqual(["a.link"]);
    expect(p.code).toEqual(["a.api"]);
    expect(p.plural).toEqual(["a.files"]);
  });
});
