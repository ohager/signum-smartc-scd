import { describe, it, expect } from "bun:test";
import { parseScenario, serializeScenario, validateScenario, defaultScenario } from "./scenario-io";

describe("scenario-io (v2)", () => {
  it("defaultScenario round-trips through serialize/parse", () => {
    const s = defaultScenario();
    expect(parseScenario(serializeScenario(s))).toEqual(s);
  });
  it("validateScenario accepts the default", () => {
    expect(validateScenario(defaultScenario()).valid).toBe(true);
  });
  it("rejects a non-2 version (old v1 files fall through)", () => {
    const r = validateScenario({ version: 1, contract: {}, accounts: [], timeline: [] });
    expect(r.valid).toBe(false);
  });
  it("rejects a missing creator", () => {
    expect(validateScenario({ version: 2, accounts: [], transactions: [] }).valid).toBe(false);
  });
  it("rejects a non-numeric account id", () => {
    const bad = { version: 2, creator: "555", accounts: [{ id: "alice", balance: "100" }], transactions: [] };
    expect(validateScenario(bad).valid).toBe(false);
  });
  it("rejects a non-numeric creator", () => {
    expect(validateScenario({ version: 2, creator: "boss", accounts: [], transactions: [] }).valid).toBe(false);
  });
  it("rejects a transaction with block < 1", () => {
    const bad = { version: 2, creator: "555", accounts: [], transactions: [{ block: 0, sender: "1001", amount: "1" }] };
    expect(validateScenario(bad).valid).toBe(false);
  });
  it("accepts an optional numeric txId", () => {
    const ok = { version: 2, creator: "555", accounts: [], transactions: [{ block: 1, sender: "1001", amount: "1", txId: "42" }] };
    expect(validateScenario(ok).valid).toBe(true);
  });
  it("parseScenario throws on invalid JSON", () => {
    expect(() => parseScenario("{ not json")).toThrow();
  });
  it("accepts JSON5 (comments, trailing commas, unquoted keys)", () => {
    const src = `{
      // activation
      version: 2,
      creator: "555",
      accounts: [ { id: "1001", balance: "100", }, ],
      transactions: [ { block: 1, sender: "1001", amount: "5" }, ],
    }`;
    const s = parseScenario(src);
    expect(s.version).toBe(2);
    expect(s.transactions.length).toBe(1);
  });
});
