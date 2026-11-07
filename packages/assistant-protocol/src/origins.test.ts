import { describe, expect, it } from "bun:test";
import { STUDIO_ORIGINS, isAllowedOrigin } from "./origins";

describe("isAllowedOrigin", () => {
  const rows: [string | undefined, boolean][] = [
    ...STUDIO_ORIGINS.map((o): [string, boolean] => [o, true]),
    ["https://evil.vercel.app", false],
    ["http://localhost:3000", false],
    ["http://localhost", false],
    ["http://127.0.0.1:5173", false],
    ["https://localhost:3000", false],
    ["http://localhost.evil.com", false],
    [undefined, false],
    ["null", false],
  ];
  for (const [origin, expected] of rows) {
    it(`${String(origin)} -> ${expected}`, () => expect(isAllowedOrigin(origin)).toBe(expected));
  }
  it("localhost origins only with allowLocalhost (the relay's --dev)", () => {
    for (const o of ["http://localhost:3000", "http://localhost", "http://127.0.0.1:5173"]) {
      expect(isAllowedOrigin(o, [], { allowLocalhost: true })).toBe(true);
    }
    expect(isAllowedOrigin("https://localhost:3000", [], { allowLocalhost: true })).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.com", [], { allowLocalhost: true })).toBe(false);
    expect(isAllowedOrigin(undefined, [], { allowLocalhost: true })).toBe(false);
  });
  it("an explicit extra localhost origin works without allowLocalhost", () => {
    expect(isAllowedOrigin("http://localhost:3000", ["http://localhost:3000"])).toBe(true);
    expect(isAllowedOrigin("http://localhost:3001", ["http://localhost:3000"])).toBe(false);
  });
  it("extra origins only when passed", () => {
    expect(isAllowedOrigin("https://x.test")).toBe(false);
    expect(isAllowedOrigin("https://x.test", ["https://x.test"])).toBe(true);
  });
});
