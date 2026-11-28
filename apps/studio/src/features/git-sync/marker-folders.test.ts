import { describe, expect, it } from "bun:test";
import { importableFolders, nestedMarkerFolders } from "./marker-folders";

const ok = (folder: string, format = 1) => ({ folder, marker: { format } });

describe("marker folders", () => {
  it("excludes both the outer and the inner folder of a nesting", () => {
    const probe = { markers: [ok(""), ok("x"), ok("y")], nested: ["x"] };
    expect(nestedMarkerFolders(probe)).toEqual(["", "x"]);
    expect(importableFolders(probe)).toEqual(["y"]);
  });

  it("excludes invalid markers and newer formats", () => {
    const probe = { markers: [ok("a", 2), { folder: "b", marker: null, error: "bad" }, ok("c")], nested: [] };
    expect(importableFolders(probe)).toEqual(["c"]);
  });

  it("does not treat siblings with a shared prefix as nested", () => {
    expect(importableFolders({ markers: [ok("a"), ok("ab")], nested: [] })).toEqual(["a", "ab"]);
  });
});
