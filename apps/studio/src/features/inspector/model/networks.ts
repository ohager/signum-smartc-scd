import { z } from "zod";

/**
 * Where a contract lives. Mainnet and testnet use a default public node; a
 * custom node says itself whether it serves testnet, because nothing else
 * could tell the inspector which address prefix to print.
 */

export const NetworkSchema = z.union([
  z.enum(["mainnet", "testnet"]),
  z.strictObject({
    node: z.url().describe("Node base URL"),
    testnet: z.boolean().optional().describe("Whether this node serves testnet (address prefix TS)"),
  }),
]);
export type Network = z.infer<typeof NetworkSchema>;

export const DEFAULT_NODES = {
  mainnet: "https://europe.signum.network",
  testnet: "https://europe3.testnet.signum.network",
} as const;

const trimSlash = (url: string) => url.replace(/\/+$/, "");

export function nodeHostOf(network: Network): string {
  return typeof network === "string" ? DEFAULT_NODES[network] : trimSlash(network.node);
}

export function addressPrefixOf(network: Network): "S" | "TS" {
  if (network === "testnet") return "TS";
  if (typeof network === "object" && network.testnet) return "TS";
  return "S";
}

export function networkKey(network: Network): string {
  return typeof network === "string" ? network : trimSlash(network.node);
}

export function sameNetwork(a: Network, b: Network): boolean {
  return networkKey(a) === networkKey(b);
}

export function networkFromWallet(network: "MainNet" | "TestNet"): Network {
  return network === "MainNet" ? "mainnet" : "testnet";
}
