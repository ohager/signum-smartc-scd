import { describe, expect, it } from "bun:test";
import type { MachineData } from "@/features/asm-editor/machine-data";
import { buildUnsignedDeploy, referenceDeployMinFeePlanck } from "./deploy-request";

const machine = { ByteCode: "3301", DataPages: 2, CodeStackPages: 1, UserStackPages: 0, MachineCodeHashId: "9" } as MachineData;
const common = { senderPublicKey: "pk", feePlanck: "40000000", deadline: 1440 };

function fakeLedger() {
  const calls = { publishContract: [] as Record<string, unknown>[], publishContractByReference: [] as Record<string, unknown>[] };
  return {
    calls,
    contract: {
      publishContract: async (args: Record<string, unknown>) => (calls.publishContract.push(args), { unsignedTransactionBytes: "full" }),
      publishContractByReference: async (args: Record<string, unknown>) =>
        (calls.publishContractByReference.push(args), { unsignedTransactionBytes: "ref" }),
    },
  };
}

describe("buildUnsignedDeploy", () => {
  it("full deploy sends code, pages, activation and data", async () => {
    const fake = fakeLedger();
    const bytes = await buildUnsignedDeploy(fake as never, { kind: "full", machine, name: "N", description: "D", activationPlanck: "5", data: ["1"] }, common);
    expect(bytes).toBe("full");
    expect(fake.calls.publishContract[0]).toMatchObject({
      codeHex: "3301", dataPages: 2, callStackPages: 1, userStackPages: 0, activationAmountPlanck: "5",
      data: ["1"], name: "N", description: "D", senderPublicKey: "pk", feePlanck: "40000000", deadline: 1440,
    });
  });

  it("reference deploy sends the full hash and data, never code", async () => {
    const fake = fakeLedger();
    const bytes = await buildUnsignedDeploy(fake as never, { kind: "reference", reference: { fullHash: "ab", contractId: "1" }, name: "N", description: "D", data: ["7"] }, common);
    expect(bytes).toBe("ref");
    const args = fake.calls.publishContractByReference[0]!;
    expect(args).toMatchObject({ referencedTransactionFullHash: "ab", data: ["7"], name: "N", description: "D", feePlanck: "40000000", deadline: 1440 });
    expect(args).not.toHaveProperty("codeHex");
    expect(fake.calls.publishContract).toHaveLength(0);
  });
});

describe("referenceDeployMinFeePlanck", () => {
  it("reference fee follows the original's pages", () => {
    expect(referenceDeployMinFeePlanck({ dataPages: 2, callStackPages: 1, userStackPages: 1, minActivationPlanck: "0", initialData: "" })).toBe(40_000_000n);
    expect(referenceDeployMinFeePlanck({ dataPages: 0, callStackPages: 0, userStackPages: 0, minActivationPlanck: "0", initialData: "" })).toBe(1_000_000n);
  });
});
