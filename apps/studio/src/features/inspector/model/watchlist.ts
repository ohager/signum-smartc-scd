import { z } from "zod";
import { editDocument, parseDocument, type Parsed } from "./jsonc";
import { NetworkSchema, sameNetwork, type Network } from "./networks";

/** The contracts a `*.inspect.json` file keeps an eye on, each with its network. */

const WatchEntrySchema = z.strictObject({
  id: z.string().regex(/^\d+$/).describe("Contract id (numeric)"),
  network: NetworkSchema,
  alias: z.string().optional(),
  note: z.string().optional(),
  labelMap: z.string().optional().describe("Pinned Label Map: workspace path or file name"),
});

export const WatchlistSchema = z.strictObject({
  $schema: z.string().optional(),
  version: z.literal(1),
  contracts: z.array(WatchEntrySchema),
});

export type WatchEntry = z.infer<typeof WatchEntrySchema>;
export type Watchlist = z.infer<typeof WatchlistSchema>;

export function parseWatchlist(text: string): Parsed<Watchlist> {
  return parseDocument(text, WatchlistSchema);
}

export function emptyWatchlist(): string {
  return JSON.stringify({ version: 1, contracts: [] }, null, 2) + "\n";
}

function current(text: string): Watchlist {
  const r = parseWatchlist(text);
  if (!r.ok) throw new Error(r.errors[0]?.message ?? "invalid watchlist");
  return r.value;
}

const indexOf = (list: Watchlist, id: string, network: Network) =>
  list.contracts.findIndex((c) => c.id === id && sameNetwork(c.network, network));

export function addContracts(text: string, entries: WatchEntry[]): string {
  let out = text;
  for (const entry of entries) {
    const list = current(out);
    if (indexOf(list, entry.id, entry.network) >= 0) continue;
    out = editDocument(out, ["contracts", list.contracts.length], entry, { insert: true });
  }
  return out;
}

export function updateContract(
  text: string,
  id: string,
  network: Network,
  patch: Partial<Omit<WatchEntry, "id" | "network">>,
): string {
  const at = indexOf(current(text), id, network);
  if (at < 0) return text;
  let out = text;
  for (const [key, value] of Object.entries(patch)) {
    out = editDocument(out, ["contracts", at, key], value);
  }
  return out;
}

export function removeContract(text: string, id: string, network: Network): string {
  const at = indexOf(current(text), id, network);
  return at < 0 ? text : editDocument(text, ["contracts", at], undefined);
}
