import { describe, expect, it } from "bun:test";
import { createPagedSearch } from "./paged-search";

describe("createPagedSearch", () => {
  it("appends pages and stops on a short page", async () => {
    const search = createPagedSearch(async (p) => (p < 2 ? [p * 2, p * 2 + 1] : [4]), 2);
    const signal = new AbortController().signal;
    await search.loadNext(signal);
    await search.loadNext(signal);
    expect(search.done).toBe(false);
    await search.loadNext(signal);
    expect(search.rows).toEqual([0, 1, 2, 3, 4]);
    expect(search.done).toBe(true);
  });

  it("stops at a known total", async () => {
    const search = createPagedSearch(async () => [1, 2], 2, 2);
    await search.loadNext(new AbortController().signal);
    expect(search.done).toBe(true);
  });

  it("keeps loaded rows and drops the in-flight page when aborted", async () => {
    let release!: () => void;
    const search = createPagedSearch(async (p) => {
      if (p === 1) await new Promise<void>((r) => (release = r));
      return [p];
    }, 1);
    const controller = new AbortController();
    await search.loadNext(controller.signal);
    const pending = search.loadNext(controller.signal);
    controller.abort();
    release();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    expect(search.rows).toEqual([0]);
  });
});
