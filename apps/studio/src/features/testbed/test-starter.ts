/**
 * Contents of a new `.test.ts`.
 *
 * `contractFileName` is resolved from the new file's own folder, so the import
 * is always a sibling path. It is null when no contract sits
 * beside the new file, in which case it must still be runnable rather than
 * importing something that does not exist.
 */
export function testStarter(fileName: string, contractFileName: string | null): string {
  const suite = (contractFileName ?? fileName).replace(/\.(test\.ts|smart\.c)$/, "");

  if (!contractFileName) {
    return `import { describe, it, expect } from "vitest";

// Point this at your contract to start testing it, then load it with
// new SimulatorTestbed(Scenario).loadContract(ContractCode).runScenario():
// import ContractCode from "./my-contract.smart.c?raw";

describe("${suite}", () => {
  it("needs a contract to test", () => {
    expect(1n).toBe(1n);
  });
});
`;
  }

  return `import { describe, it, expect, beforeEach } from "vitest";
import { SimulatorTestbed, type TransactionObj } from "signum-smartc-testbed";
import ContractCode from "./${contractFileName}?raw";

// Transactions sent to the contract. Block 1 activates it.
const Scenario: TransactionObj[] = [
  { blockheight: 1, amount: 2_0000_0000n, sender: 10n, recipient: 1n },
];

describe("${suite}", () => {
  let testbed: SimulatorTestbed;

  beforeEach(() => {
    testbed = new SimulatorTestbed(Scenario).loadContract(ContractCode).runScenario();
  });

  it("activates", () => {
    // Read any contract variable by name, or a map entry with getContractMapValue(k1, k2).
    expect(testbed.getTransactions().length).toBeGreaterThan(0);
  });
});
`;
}
