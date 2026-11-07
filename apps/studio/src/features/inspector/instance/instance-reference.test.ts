import { describe, expect, it } from "bun:test";
import { resolveInstanceReference } from "./instance-reference";

const CREATION = "0300" + "0000" + "0100" + "0100" + "0100" + "0000" + "0000000000000000" + "01" + "33" + "00";
const deployTx = (fullHash: string, extra: object = {}) =>
  ({ transaction: "1", fullHash, height: 5, sender: "100", type: 22, subtype: 0, attachment: { name: "C", creationBytes: CREATION }, ...extra });

function fake(opts: { hash?: string; notFound?: boolean; nodeDown?: boolean; tx?: object; original?: object }) {
  const notFound = { data: { errorCode: 5, errorDescription: "Unknown" } };
  return {
    contract: {
      getAllContractsByCodeHash: async () => ({ ats: [] }),
      getContract: async () => {
        if (opts.nodeDown) throw { data: { errorCode: 1, errorDescription: "boom" } };
        if (opts.notFound) throw notFound;
        return { machineCodeHashId: opts.hash };
      },
    },
    transaction: {
      getTransaction: async () => opts.tx,
      getTransactionByFullHash: async (h: string) => {
        if (opts.original && (opts.original as { fullHash: string }).fullHash === h) return opts.original;
        throw notFound;
      },
    },
  } as never;
}

describe("resolveInstanceReference", () => {
  it("uses the contract's own deploy transaction for an original", async () =>
    expect(await resolveInstanceReference(fake({ hash: "9", tx: deployTx("aa") }), "1", "9")).toMatchObject({ ok: true, reference: { fullHash: "aa" } }));

  it("traces an instance to its original", async () => {
    const instanceTx = deployTx("bb", { referencedTransactionFullHash: "aa", attachment: { name: "I", creationBytes: CREATION } });
    const original = { ...deployTx("aa"), transaction: "7" };
    expect(await resolveInstanceReference(fake({ hash: "9", tx: instanceTx, original }), "1", "9")).toMatchObject({
      ok: true,
      reference: { fullHash: "aa", contractId: "7" },
    });
  });

  it("rejects a missing or different contract on the wallet's node", async () => {
    expect(await resolveInstanceReference(fake({ notFound: true }), "1", "9")).toMatchObject({ ok: false, reason: "otherNetwork" });
    expect(await resolveInstanceReference(fake({ hash: "8", tx: deployTx("aa") }), "1", "9")).toMatchObject({ ok: false, reason: "otherNetwork" });
  });

  it("reports an instance whose original is gone", async () => {
    const orphan = deployTx("bb", { referencedTransactionFullHash: "zz" });
    expect(await resolveInstanceReference(fake({ hash: "9", tx: orphan }), "1", "9")).toMatchObject({ ok: false, reason: "noOriginal" });
  });

  it("passes other node errors on", async () =>
    expect(await resolveInstanceReference(fake({ nodeDown: true }), "1", "9")).toMatchObject({ ok: false, reason: "node", message: "boom" }));
});
