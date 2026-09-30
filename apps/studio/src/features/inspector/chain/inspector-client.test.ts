import { describe, expect, it } from "bun:test";
import type { Contract } from "@signumjs/contracts";
import { HttpError } from "@signumjs/http";
import { contractStatus, createInspectorClient, filterSummaries, InspectorError, toSummary, type LedgerLike } from "./inspector-client";

const contract = (over: Partial<Contract> = {}): Contract =>
  ({
    at: "1", name: "Market", description: "NFT market", creator: "9", balanceNQT: "100", machineCodeHashId: "77",
    machineData: "", running: true, stopped: false, finished: false, frozen: false, dead: false, ...over,
  }) as Contract;

function fakeLedger(ats: Contract[], calls: string[] = []): LedgerLike {
  return {
    contract: {
      getContract: async (id: string) => {
        calls.push(`get:${id}`);
        const c = ats.find((a) => a.at === id);
        if (!c) throw new HttpError("u", 200, "Unknown AT", { errorCode: 5, errorDescription: "Unknown AT" });
        return c;
      },
      getContractsByAccount: async ({ accountId }: { accountId: string }) => ({
        ats: ats.filter((a) => a.creator === accountId), requestProcessingTime: 0,
      }),
      getAllContractIds: async () => ({ atIds: ats.map((a) => a.at), requestProcessingTime: 0 }),
      getAllContractsByCodeHash: async ({ firstIndex = 0, lastIndex = 0 }: { firstIndex?: number; lastIndex?: number }) => ({
        ats: ats.slice(firstIndex, lastIndex + 1), requestProcessingTime: 0,
      }),
      getContractMapValuesByFirstKey: async ({ firstIndex = 0 }: { firstIndex?: number }) => ({
        keyValues: firstIndex === 0 ? [{ key2: "1", value: "-1" }] : [], requestProcessingTime: 0,
      }),
      getSingleContractMapValue: async () => ({ value: "5" }),
    } as unknown as LedgerLike["contract"],
  };
}

describe("status and summary", () => {
  it("picks the most significant state", () => {
    expect(contractStatus(contract())).toBe("running");
    expect(contractStatus(contract({ finished: true }))).toBe("finished");
    expect(contractStatus(contract({ stopped: true, dead: true }))).toBe("dead");
    expect(toSummary(contract())).toEqual({
      id: "1", name: "Market", description: "NFT market", creator: "9", balance: "100", status: "running", codeHash: "77",
    });
  });
});

describe("createInspectorClient", () => {
  const ats = [contract(), contract({ at: "2", name: "Other", creator: "8" }), contract({ at: "3" })];
  const client = createInspectorClient("testnet", () => fakeLedger(ats));

  it("maps unknown contracts to not-found", async () => {
    await expect(client.getContract("404")).rejects.toMatchObject({ kind: "not-found" });
  });

  it("maps network failures to unreachable", async () => {
    const down = createInspectorClient("testnet", () => ({
      contract: { getContract: async () => { throw new TypeError("Failed to fetch"); } } as unknown as LedgerLike["contract"],
    }));
    const error = await down.getContract("1").catch((e) => e);
    expect(error).toBeInstanceOf(InspectorError);
    expect(error.kind).toBe("unreachable");
  });

  it("lists by creator, counts and pages by hash", async () => {
    expect((await client.listByCreator("9")).map((s) => s.id)).toEqual(["1", "3"]);
    expect(await client.countByCodeHash("77")).toBe(3);
    expect((await client.listByCodeHash("77", 1, 2)).map((s) => s.id)).toEqual(["3"]);
  });

  it("reads maps", async () => {
    expect(await client.getMapByKey1("1", "10", 0, 100)).toEqual([{ key2: "1", value: "-1" }]);
    expect(await client.getMapValue("1", "10", "1")).toBe("5");
  });
});

describe("filterSummaries", () => {
  it("matches id, name, description and status case-insensitively", () => {
    const rows = [toSummary(contract()), toSummary(contract({ at: "2", name: "Other", finished: true }))];
    expect(filterSummaries(rows, "market").map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterSummaries(rows, "FINISHED").map((r) => r.id)).toEqual(["2"]);
    expect(filterSummaries(rows, "").length).toBe(2);
  });
});
