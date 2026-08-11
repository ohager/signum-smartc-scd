import { describe, it, expect } from "bun:test";
import { buildZip, parseZip, dirsForEntries, decodeTextOrNull, type TransferEntry } from "./transfer";

const byPath = (a: { path: string }, b: { path: string }) => a.path.localeCompare(b.path);

describe("buildZip / parseZip", () => {
  it("round-trips paths and UTF-8 text content", () => {
    const entries: TransferEntry[] = [
      { path: "a.txt", content: "hello" },
      { path: "d/b.txt", content: "héllo € — ✓" },
    ];
    const back = parseZip(buildZip(entries));
    expect([...back].sort(byPath)).toEqual([...entries].sort(byPath));
  });

  it("skips directory entries when parsing", () => {
    // A single nested file produces no standalone dir entry from our builder,
    // but parseZip must still ignore any path ending in "/".
    const back = parseZip(buildZip([{ path: "x/y.txt", content: "z" }]));
    expect(back.every((e) => !e.path.endsWith("/"))).toBe(true);
    expect(back).toEqual([{ path: "x/y.txt", content: "z" }]);
  });
});

describe("dirsForEntries", () => {
  it("returns intermediate dirs, deduped, parent-first, no root", () => {
    expect(dirsForEntries(["a/b/c.txt", "a/d.txt", "e.txt"])).toEqual(["a", "a/b"]);
  });

  it("returns [] for root-level files only", () => {
    expect(dirsForEntries(["x.txt", "y.txt"])).toEqual([]);
  });
});

describe("decodeTextOrNull", () => {
  it("decodes valid UTF-8 to a string", () => {
    const bytes = new TextEncoder().encode("héllo € ✓");
    expect(decodeTextOrNull(bytes)).toBe("héllo € ✓");
  });

  it("returns null for content with a NUL byte", () => {
    expect(decodeTextOrNull(new Uint8Array([104, 105, 0, 33]))).toBeNull();
  });

  it("returns null for invalid UTF-8 (binary)", () => {
    // Lone 0xFF/0xFE are invalid UTF-8 start bytes.
    expect(decodeTextOrNull(new Uint8Array([0xff, 0xfe, 0xfd]))).toBeNull();
  });
});
