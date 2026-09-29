import { describe, expect, it } from "bun:test";
import { splitRich } from "./rich";

describe("splitRich", () => {
  it("splits known tags out of the text", () => {
    expect(splitRich("Press <code>F10</code> to step.", ["code"])).toEqual([
      "Press ",
      { tag: "code", text: "F10" },
      " to step.",
    ]);
  });

  it("keeps the translator's order", () => {
    expect(splitRich("<link>Handbuch</link> lesen, dann <code>F10</code>.", ["code", "link"])).toEqual([
      { tag: "link", text: "Handbuch" },
      " lesen, dann ",
      { tag: "code", text: "F10" },
      ".",
    ]);
  });

  it("leaves unknown tags as literal text", () => {
    expect(splitRich("a <b>bold</b> c", ["code"])).toEqual(["a <b>bold</b> c"]);
  });

  it("returns plain text unchanged", () => {
    expect(splitRich("plain", ["code"])).toEqual(["plain"]);
  });
});
