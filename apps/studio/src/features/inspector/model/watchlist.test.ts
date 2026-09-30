import { describe, expect, it } from "bun:test";
import { addContracts, emptyWatchlist, moveContract, parseWatchlist, removeContract, updateContract } from "./watchlist";

const text = `{
  "version": 1,
  // my contracts
  "contracts": [
    { "id": "1", "network": "testnet", "alias": "one" }, // first
  ],
}`;

const value = (t: string) => {
  const r = parseWatchlist(t);
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r.value;
};

describe("watchlist", () => {
  it("parses JSONC and custom nodes", () => {
    expect(value(text).contracts[0]!.alias).toBe("one");
    const custom = `{ "version": 1, "contracts": [ { "id": "2", "network": { "node": "https://n.example", "testnet": true } } ] }`;
    expect(value(custom).contracts[0]!.network).toEqual({ node: "https://n.example", testnet: true });
  });

  it("rejects a non-numeric id", () => {
    expect(parseWatchlist(`{ "version": 1, "contracts": [ { "id": "S-ABC", "network": "mainnet" } ] }`).ok).toBe(false);
  });

  it("adds without duplicates and keeps comments", () => {
    const out = addContracts(text, [
      { id: "1", network: "testnet" },
      { id: "1", network: "mainnet" },
      { id: "3", network: "testnet" },
    ]);
    expect(value(out).contracts.map((c) => `${c.id}@${c.network}`)).toEqual(["1@testnet", "1@mainnet", "3@testnet"]);
    expect(out).toContain("// my contracts");
    expect(out).toContain("// first");
  });

  it("updates and removes fields and entries", () => {
    let out = updateContract(text, "1", "testnet", { note: "hi", alias: undefined });
    expect(value(out).contracts[0]).toEqual({ id: "1", network: "testnet", note: "hi" });
    out = removeContract(out, "1", "testnet");
    expect(value(out).contracts).toEqual([]);
  });

  it("creates an empty watchlist", () => {
    expect(value(emptyWatchlist()).contracts).toEqual([]);
  });
});

describe("moveContract", () => {
  it("moves an entry to another node and keeps its alias and comments", () => {
    const out = moveContract(text, "1", "testnet", { node: "https://n.example", testnet: true });
    expect(value(out).contracts[0]).toEqual({ id: "1", network: { node: "https://n.example", testnet: true }, alias: "one" });
    expect(out).toContain("// first");
  });
});
