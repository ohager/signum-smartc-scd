import { z } from "zod";
import { DEFAULT_NODES, networkKey, type Network } from "./networks";

/**
 * What the network picker offers, one layer above `Network`: the watchlist
 * stores plain networks, while the picker also knows the local testnet, the
 * node the connected wallet uses, and the last custom node typed — so picking
 * "Custom" again brings it back.
 */

export const LOCAL_NODE = "http://localhost:6876";

export const NETWORK_KINDS = ["mainnet", "testnet", "local", "wallet", "custom"] as const;
export type NetworkKind = (typeof NETWORK_KINDS)[number];

const CustomNodeSchema = z.object({ node: z.string(), testnet: z.boolean().optional() });
export type CustomNode = z.infer<typeof CustomNodeSchema>;

export const DEFAULT_CUSTOM: CustomNode = { node: "https://" };

const StoredChoiceSchema = z.object({
  kind: z.enum(NETWORK_KINDS),
  custom: CustomNodeSchema.optional(),
});

export interface NetworkChoice {
  kind: NetworkKind;
  custom: CustomNode;
}

/** The connected wallet's node, as the picker needs it. */
export interface WalletNode {
  node: string;
  testnet: boolean;
}

const trimSlash = (url: string) => url.replace(/\/+$/, "");

/** A wallet on one of the default public nodes reads as that network, so its contracts key the same as everyone else's. */
export function walletNetwork(wallet: WalletNode): Network {
  const node = trimSlash(wallet.node);
  if (node === DEFAULT_NODES.mainnet) return "mainnet";
  if (node === DEFAULT_NODES.testnet) return "testnet";
  return wallet.testnet ? { node, testnet: true } : { node };
}

/** "Wallet node" without a wallet shows and reads as testnet; the stored choice keeps "wallet" for when it connects. */
export function effectiveKind(choice: NetworkChoice, wallet: WalletNode | null): NetworkKind {
  return choice.kind === "wallet" && !wallet ? "testnet" : choice.kind;
}

export function resolveChoice(choice: NetworkChoice, wallet: WalletNode | null): Network {
  switch (effectiveKind(choice, wallet)) {
    case "mainnet":
      return "mainnet";
    case "testnet":
      return "testnet";
    case "local":
      return { node: LOCAL_NODE, testnet: true };
    case "wallet":
      return walletNetwork(wallet!);
    case "custom":
      return choice.custom.testnet ? { node: choice.custom.node, testnet: true } : { node: choice.custom.node };
  }
}

export function defaultChoice(wallet: WalletNode | null): NetworkChoice {
  return { kind: wallet ? "wallet" : "testnet", custom: DEFAULT_CUSTOM };
}

/** Which preset a stored network is, keeping `custom` as the remembered custom node unless the network is itself custom. */
export function choiceOf(network: Network, wallet: WalletNode | null, custom: CustomNode): NetworkChoice {
  if (typeof network === "string") return { kind: network, custom };
  const key = networkKey(network);
  if (key === LOCAL_NODE) return { kind: "local", custom };
  if (wallet && key === trimSlash(wallet.node)) return { kind: "wallet", custom };
  return { kind: "custom", custom: network.testnet ? { node: key, testnet: true } : { node: key } };
}

export function parseStoredChoice(raw: string | null): NetworkChoice | null {
  if (!raw) return null;
  try {
    const parsed = StoredChoiceSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { kind: parsed.data.kind, custom: parsed.data.custom ?? DEFAULT_CUSTOM } : null;
  } catch {
    return null;
  }
}
