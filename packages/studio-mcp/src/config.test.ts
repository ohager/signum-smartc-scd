import { describe, expect, test } from "bun:test";
import { parseConfig } from "./config";

describe("parseConfig", () => {
  test("defaults to 6890", () => {
    expect(parseConfig([], {})).toEqual({ port: 6890, allowOrigins: [], dev: false });
  });
  test("--port flag", () => {
    expect(parseConfig(["--port", "7000"], {}).port).toBe(7000);
    expect(parseConfig(["--port=7002"], {}).port).toBe(7002);
  });
  test("SMARTC_STUDIO_PORT env", () => {
    expect(parseConfig([], { SMARTC_STUDIO_PORT: "7001" }).port).toBe(7001);
  });
  test("flag beats env", () => {
    expect(parseConfig(["--port", "7000"], { SMARTC_STUDIO_PORT: "7001" }).port).toBe(7000);
  });
  test("rejects the Studio's reserved ports and non-integers", () => {
    expect(() => parseConfig(["--port", "6876"], {})).toThrow();
    expect(() => parseConfig([], { SMARTC_STUDIO_PORT: "6877" })).toThrow();
    expect(() => parseConfig(["--port", "abc"], {})).toThrow();
    expect(() => parseConfig(["--port", "12.5"], {})).toThrow();
    expect(() => parseConfig(["--port", "70000"], {})).toThrow();
    expect(() => parseConfig(["--port"], {})).toThrow();
  });
  test("--dev or SMARTC_STUDIO_DEV=1 allows localhost origins", () => {
    expect(parseConfig(["--dev"], {}).dev).toBe(true);
    expect(parseConfig(["--port", "7000", "--dev"], {})).toEqual({ port: 7000, allowOrigins: [], dev: true });
    expect(parseConfig([], { SMARTC_STUDIO_DEV: "1" }).dev).toBe(true);
    expect(parseConfig([], { SMARTC_STUDIO_DEV: "0" }).dev).toBe(false);
    expect(parseConfig([], { SMARTC_STUDIO_DEV: "" }).dev).toBe(false);
  });
  test("collects repeated --allow-origin", () => {
    expect(parseConfig(["--allow-origin", "https://x.test", "--allow-origin=https://y.test"], {}).allowOrigins).toEqual([
      "https://x.test",
      "https://y.test",
    ]);
  });
});
