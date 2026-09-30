import { describe, expect, it } from "bun:test";
import { addressPrefixOf, DEFAULT_NODES, networkFromWallet, networkKey, nodeHostOf, sameNetwork } from "./networks";

describe("networks", () => {
  it("resolves hosts and prefixes", () => {
    expect(nodeHostOf("mainnet")).toBe(DEFAULT_NODES.mainnet);
    expect(nodeHostOf({ node: "https://n.example/" })).toBe("https://n.example");
    expect(addressPrefixOf("testnet")).toBe("TS");
    expect(addressPrefixOf({ node: "https://x", testnet: true })).toBe("TS");
    expect(addressPrefixOf({ node: "https://x" })).toBe("S");
  });

  it("compares by key", () => {
    expect(sameNetwork({ node: "https://x/" }, { node: "https://x" })).toBe(true);
    expect(sameNetwork("mainnet", "testnet")).toBe(false);
    expect(networkKey("testnet")).toBe("testnet");
    expect(networkFromWallet("TestNet")).toBe("testnet");
  });
});
