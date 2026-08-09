import { describe, it, expect } from "bun:test";
import { parseScenario, serializeScenario, validateScenario, defaultScenario } from "./scenario-io";

describe("scenario-io", () => {
  it("defaultScenario round-trips through serialize/parse", () => {
    const s = defaultScenario();
    expect(parseScenario(serializeScenario(s))).toEqual(s);
  });
  it("validateScenario accepts the default", () => {
    expect(validateScenario(defaultScenario()).valid).toBe(true);
  });
  it("validateScenario reports errors for a bad scenario", () => {
    const r = validateScenario({ version: 1, timeline: "nope" });
    expect(r.valid).toBe(false);
    if (!r.valid) expect(r.errors.length).toBeGreaterThan(0);
  });
  it("parseScenario throws on invalid JSON", () => {
    expect(() => parseScenario("{ not json")).toThrow();
  });
  it("parseScenario throws on structurally invalid scenario", () => {
    expect(() => parseScenario(JSON.stringify({ version: 2 }))).toThrow();
  });
});
