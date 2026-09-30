import type { ContractSummary, InspectorClient } from "./inspector-client";
import { createPagedSearch, type PagedSearch } from "./paged-search";

/**
 * The three ways the add dialog finds contracts. Each checks its signal after
 * every await and rejects with an AbortError, so a cancelled or closed dialog
 * never adds an entry or shows a count that belongs to a search nobody wants.
 * The caller sets state only from a resolved result.
 */

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  const e = new Error("aborted");
  e.name = "AbortError";
  throw e;
}

export interface SearchResult {
  total: number;
  search: PagedSearch<ContractSummary>;
}

export async function verifyContract(client: InspectorClient, id: string, signal: AbortSignal): Promise<void> {
  await client.getContract(id);
  throwIfAborted(signal);
}

export async function searchByCreator(
  client: InspectorClient,
  accountId: string,
  codeHash: string | undefined,
  pageSize: number,
  signal: AbortSignal,
): Promise<SearchResult> {
  const all = await client.listByCreator(accountId, { codeHash });
  throwIfAborted(signal);
  const search = createPagedSearch(async (page) => all.slice(page * pageSize, (page + 1) * pageSize), pageSize, all.length);
  await search.loadNext(signal);
  return { total: all.length, search };
}

export async function searchByCodeHash(
  client: InspectorClient,
  hash: string,
  pageSize: number,
  signal: AbortSignal,
): Promise<SearchResult> {
  const total = await client.countByCodeHash(hash);
  throwIfAborted(signal);
  const search = createPagedSearch((page) => client.listByCodeHash(hash, page, pageSize), pageSize, total);
  await search.loadNext(signal);
  return { total, search };
}
