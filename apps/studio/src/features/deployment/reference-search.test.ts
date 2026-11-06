import { describe, expect, it } from "bun:test";
import {
  findReferences,
  parseCreationHeader,
  pickReference,
  traceOriginal,
  type ReferenceCandidate,
  type ReferenceLedger,
} from "./reference-search";

// version 3, reserved, 1 code page, 2 data pages, 1 call-stack page, 0 user-stack pages, min activation 1 SIGNA
const HEADER = "0300" + "0000" + "0100" + "0200" + "0100" + "0000" + "00e1f50500000000";
// code: 1-byte length (1 page) 2, bytes 3301; data: 2-byte length (2 pages) 8, one slot = 7
const CREATION = HEADER + "02" + "3301" + "0800" + "0700000000000000";

type Tx = { transaction: string; fullHash: string; height: number; sender: string; type?: number; subtype?: number; referencedTransactionFullHash?: string; attachment?: { name: string; creationBytes: string } };
const original = (id: string, fullHash: string, sender: string, height: number): Tx =>
  ({ transaction: id, fullHash, height, sender, type: 22, subtype: 0, attachment: { name: `C${id}`, creationBytes: CREATION } });
const instance = (id: string, ref: string): Tx =>
  ({ transaction: id, fullHash: `i${id}`, height: 99, sender: "300", type: 22, subtype: 0, referencedTransactionFullHash: ref, attachment: { name: `I${id}`, creationBytes: HEADER } });

function fakeLedger(hits: string[], txs: Tx[], opts: { fail?: unknown; delayMs?: number } = {}) {
  const fake = {
    lastQuery: undefined as unknown,
    contract: {
      getAllContractsByCodeHash: async (args: unknown) => {
        fake.lastQuery = args;
        if (opts.fail) throw opts.fail;
        if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
        return { ats: hits.map((at) => ({ at })) };
      },
    },
    transaction: {
      getTransaction: async (id: string) => {
        const tx = txs.find((t) => t.transaction === id);
        if (!tx) throw { data: { errorCode: 5, errorDescription: "Unknown transaction" } };
        return tx;
      },
      getTransactionByFullHash: async (hash: string) => {
        const tx = txs.find((t) => t.fullHash === hash);
        if (!tx) throw { data: { errorCode: 5, errorDescription: "Unknown transaction" } };
        return tx;
      },
    },
  };
  return fake as typeof fake & ReferenceLedger;
}

const cand = (contractId: string, creator: string, height: number) =>
  ({ contractId, creator, height, name: "", fullHash: "", header: parseCreationHeader(HEADER) }) as ReferenceCandidate;

describe("findReferences", () => {
  const fake = fakeLedger(["1", "2", "3"], [original("1", "aa", "100", 10), original("2", "bb", "200", 20), instance("3", "aa")]);

  it("keeps originals and folds instances into their original", async () => {
    const found = await findReferences(fake, "123");
    expect(found.map((c) => c.contractId)).toEqual(["1", "2"]);
    expect(found[0]).toMatchObject({ fullHash: "aa", height: 10, creator: "100", name: "C1" });
  });

  it("asks for the first 25 hits", async () => {
    await findReferences(fake, "123");
    expect(fake.lastQuery).toMatchObject({ machineCodeHash: "123", firstIndex: 0, lastIndex: 24 });
  });

  it("finds an original that is not among the hits", async () => {
    const outside = fakeLedger(["5"], [original("4", "dd", "100", 5), instance("5", "dd")]);
    expect((await findReferences(outside, "123")).map((c) => c.contractId)).toEqual(["4"]);
  });

  it("aborted search resolves to nothing", async () => {
    const ac = new AbortController();
    const p = findReferences(fakeLedger(["1"], [original("1", "aa", "100", 10)], { delayMs: 20 }), "123", ac.signal);
    ac.abort();
    expect(await p).toEqual([]);
  });

  it("node errors become InspectorError", async () => {
    await expect(findReferences(fakeLedger([], [], { fail: new TypeError("fetch failed") }), "123")).rejects.toMatchObject({ kind: "unreachable" });
  });
});

describe("traceOriginal", () => {
  it("drops a reference that leads to no AT creation", async () => {
    const broken = fakeLedger([], [instance("3", "zz"), { transaction: "9", fullHash: "zz", height: 1, sender: "1", type: 0, subtype: 0 }]);
    expect(await traceOriginal(broken, "3")).toBeNull();
    expect(await traceOriginal(fakeLedger([], [instance("3", "missing")]), "3")).toBeNull();
  });

  it("drops a deploy transaction without code", async () => {
    const codeless = { ...original("1", "aa", "100", 10), attachment: { name: "x", creationBytes: "0300000000000200010000000000000000000000" } };
    expect(await traceOriginal(fakeLedger([], [codeless]), "1")).toBeNull();
  });
});

describe("pickReference", () => {
  it("prefers the account's own oldest, then the oldest", () => {
    const c = [cand("1", "100", 30), cand("2", "200", 10), cand("3", "100", 20)];
    expect(pickReference(c, "100")?.contractId).toBe("3");
    expect(pickReference(c, "999")?.contractId).toBe("2");
    expect(pickReference(c, null)?.contractId).toBe("2");
    expect(pickReference([], "100")).toBeNull();
  });
});

describe("parseCreationHeader", () => {
  it("reads pages and activation", () =>
    expect(parseCreationHeader(HEADER)).toEqual({ dataPages: 2, callStackPages: 1, userStackPages: 0, minActivationPlanck: "100000000", initialData: "" }));

  it("reads the initial data behind the code", () =>
    expect(parseCreationHeader(CREATION).initialData).toBe("0700000000000000"));
});
