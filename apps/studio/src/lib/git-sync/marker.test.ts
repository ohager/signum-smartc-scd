import { describe, expect, it } from "bun:test";
import { findMarkerFolders, markerPath, parseMarker, serializeMarker } from "./marker.ts";

describe("marker", () => {
  it("parses format and keeps unknown keys", () => {
    expect(parseMarker('{ "format": 1, "ignore": ["x"] }')).toEqual({
      ok: true,
      marker: { format: 1, ignore: ["x"] },
    });
  });
  it("rejects non-JSON, non-objects and a missing or non-integer format", () => {
    for (const t of ["nope", "[]", "{}", '{"format":"1"}', '{"format":1.5}']) {
      expect(parseMarker(t).ok).toBe(false);
    }
  });
  it("serializes with 2 spaces and a trailing newline", () => {
    expect(serializeMarker({ format: 1 })).toBe('{\n  "format": 1\n}\n');
  });
  it("builds the marker path", () => {
    expect(markerPath("")).toBe(".smartc-studio");
    expect(markerPath("a/b")).toBe("a/b/.smartc-studio");
  });
  it("finds marker folders and flags nested ones", () => {
    expect(
      findMarkerFolders([".smartc-studio", "a/.smartc-studio", "b/c/.smartc-studio", "b/x.ts"]),
    ).toEqual({ folders: ["", "a", "b/c"], nested: ["a", "b/c"] });
    expect(findMarkerFolders(["a/.smartc-studio", "b/.smartc-studio"])).toEqual({
      folders: ["a", "b"],
      nested: [],
    });
  });
});
