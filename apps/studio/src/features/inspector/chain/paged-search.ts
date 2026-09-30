/**
 * Loads a long result list one page at a time. Rows already on screen survive
 * an abort; the page that was in flight is dropped, so a closed dialog never
 * receives a late write.
 */

export interface PagedSearch<T> {
  readonly rows: T[];
  readonly done: boolean;
  loadNext(signal: AbortSignal): Promise<void>;
}

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

export function createPagedSearch<T>(
  fetchPage: (page: number) => Promise<T[]>,
  pageSize: number,
  total?: number,
): PagedSearch<T> {
  const state = { rows: [] as T[], done: total === 0, page: 0 };
  return {
    get rows() {
      return state.rows;
    },
    get done() {
      return state.done;
    },
    async loadNext(signal) {
      if (state.done) return;
      if (signal.aborted) throw abortError();
      const page = await fetchPage(state.page);
      if (signal.aborted) throw abortError();
      state.rows = [...state.rows, ...page];
      state.page++;
      state.done = page.length < pageSize || (total !== undefined && state.rows.length >= total);
    },
  };
}
