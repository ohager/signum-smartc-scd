import { describe, expect, it } from "bun:test";
import type { InspectorClient } from "./inspector-client";
import { searchByCodeHash, searchByCreator, verifyContract } from "./add-flows";

/** A client whose every call waits until the test lets it go. */
function slowClient() {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const after = async <T,>(value: T) => {
    await gate;
    return value;
  };
  const client = {
    getContract: () => after({ at: "1" }),
    listByCreator: () => after([{ id: "1" }]),
    countByCodeHash: () => after(1),
    listByCodeHash: () => after([{ id: "1" }]),
  } as unknown as InspectorClient;
  return { client, release };
}


describe("add flows stop at an abort", () => {
  it("verifyContract rejects instead of resolving after an abort", async () => {
    const { client, release } = slowClient();
    const controller = new AbortController();
    const pending = verifyContract(client, "1", controller.signal);
    controller.abort();
    release();
    await expect(pending).rejects.toMatchObject({ name: "AbortError" });
  });

  it("searchByCreator and searchByCodeHash reject after an abort", async () => {
    for (const run of [
      (c: InspectorClient, s: AbortSignal) => searchByCreator(c, "9", undefined, 100, s),
      (c: InspectorClient, s: AbortSignal) => searchByCodeHash(c, "77", 100, s),
    ]) {
      const { client, release } = slowClient();
      const controller = new AbortController();
      const pending = run(client, controller.signal);
      controller.abort();
      release();
      await expect(pending).rejects.toMatchObject({ name: "AbortError" });
    }
  });

  it("returns a loaded first page when not aborted", async () => {
    const { client, release } = slowClient();
    release();
    const result = await searchByCodeHash(client, "77", 100, new AbortController().signal);
    expect(result.total).toBe(1);
    expect(result.search.rows as unknown[]).toEqual([{ id: "1" }]);
  });
});
