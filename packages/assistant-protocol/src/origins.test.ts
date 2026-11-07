import { describe, expect, it } from "bun:test";
import { STUDIO_ORIGINS, isAllowedOrigin } from "./origins";

describe("isAllowedOrigin", () => {
  const rows: [string | undefined, boolean][] = [
    ...STUDIO_ORIGINS.map((o): [string, boolean] => [o, true]),
    ["https://evil.vercel.app", false],
    ["http://localhost:3000", true],
    ["http://localhost", true],
    ["http://127.0.0.1:5173", true],
    ["https://localhost:3000", false],
    ["http://localhost.evil.com", false],
    [undefined, false],
    ["null", false],
  ];
  for (const [origin, expected] of rows) {
    it(`${String(origin)} -> ${expected}`, () => expect(isAllowedOrigin(origin)).toBe(expected));
  }
  it("extra origins only when passed", () => {
    expect(isAllowedOrigin("https://x.test")).toBe(false);
    expect(isAllowedOrigin("https://x.test", ["https://x.test"])).toBe(true);
  });
});
