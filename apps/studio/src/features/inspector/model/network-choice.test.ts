import { describe, expect, it } from "bun:test";
import {
  choiceOf,
  DEFAULT_CUSTOM,
  defaultChoice,
  effectiveKind,
  LOCAL_NODE,
  parseStoredChoice,
  resolveChoice,
  walletNetwork,
  type NetworkChoice,
} from "./network-choice";
import { DEFAULT_NODES } from "./networks";

const wallet = { node: "https://node.wallet.example/", testnet: true };
const choice = (kind: NetworkChoice["kind"], custom = { node: "https://my.node" }): NetworkChoice => ({ kind, custom });

describe("network choice", () => {
  it("resolves every kind to a network", () => {
    expect(resolveChoice(choice("mainnet"), null)).toBe("mainnet");
    expect(resolveChoice(choice("testnet"), null)).toBe("testnet");
    expect(resolveChoice(choice("local"), null)).toEqual({ node: LOCAL_NODE, testnet: true });
    expect(resolveChoice(choice("wallet"), wallet)).toEqual({ node: "https://node.wallet.example", testnet: true });
    expect(resolveChoice(choice("custom", { node: "https://c", testnet: true } as never), null)).toEqual({
      node: "https://c",
      testnet: true,
    });
  });

  it("falls back to testnet while the wallet is not connected", () => {
    expect(effectiveKind(choice("wallet"), null)).toBe("testnet");
    expect(resolveChoice(choice("wallet"), null)).toBe("testnet");
    expect(effectiveKind(choice("wallet"), wallet)).toBe("wallet");
  });

  it("reads a wallet on a default public node as that network, so watch entries do not split", () => {
    expect(walletNetwork({ node: DEFAULT_NODES.mainnet + "/", testnet: false })).toBe("mainnet");
    expect(walletNetwork({ node: DEFAULT_NODES.testnet, testnet: true })).toBe("testnet");
  });

  it("defaults to the wallet node when a wallet is connected", () => {
    expect(defaultChoice(wallet).kind).toBe("wallet");
    expect(defaultChoice(null).kind).toBe("testnet");
    expect(defaultChoice(null).custom).toEqual(DEFAULT_CUSTOM);
  });

  it("recognises a network as one of the presets", () => {
    const custom = { node: "https://remembered" };
    expect(choiceOf("mainnet", wallet, custom)).toEqual({ kind: "mainnet", custom });
    expect(choiceOf({ node: LOCAL_NODE + "/" }, wallet, custom).kind).toBe("local");
    expect(choiceOf({ node: "https://node.wallet.example" }, wallet, custom).kind).toBe("wallet");
    expect(choiceOf({ node: "https://other", testnet: true }, wallet, custom)).toEqual({
      kind: "custom",
      custom: { node: "https://other", testnet: true },
    });
  });

  it("parses only well-formed stored choices", () => {
    expect(parseStoredChoice(null)).toBeNull();
    expect(parseStoredChoice("not json")).toBeNull();
    expect(parseStoredChoice(JSON.stringify({ kind: "moon", custom: { node: "x" } }))).toBeNull();
    expect(parseStoredChoice(JSON.stringify({ kind: "custom", custom: { node: "https://n", testnet: true } }))).toEqual({
      kind: "custom",
      custom: { node: "https://n", testnet: true },
    });
    expect(parseStoredChoice(JSON.stringify({ kind: "local" }))).toEqual({ kind: "local", custom: DEFAULT_CUSTOM });
  });
});
