import { describe, it, expect } from "bun:test";
import { createRecorder } from "./recording";

/** Stand-in for SimulatorTestbed with the two methods the recorder observes. */
class FakeTestbed {
  loaded: string[] = [];
  loadContract(code: string, options?: unknown) {
    this.loaded.push(code);
    return this;
  }
  runScenario(txs?: any[]) {
    return this;
  }
  sendTransactionAndGetResponse(txs: any[]) {
    // The real testbed stamps the current height onto each tx before sending.
    for (const tx of txs) tx.blockheight = 7;
    return [];
  }
}

describe("createRecorder", () => {
  it("records the contract source that was loaded", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().loadContract("#program name X");
    expect(recording.contractSource).toBe("#program name X");
  });

  it("records loader options", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().loadContract("src", { creator: 9n, initializers: { a: 1 } });
    expect(recording.creator).toBe(9n);
    expect(recording.initializers).toEqual({ a: 1 });
  });

  it("records transactions passed to the constructor", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded([{ blockheight: 1, amount: 5n, sender: 10n }]);
    expect(recording.transactions).toHaveLength(1);
    expect(recording.transactions[0].sender).toBe(10n);
  });

  it("records transactions passed to runScenario", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().runScenario([{ blockheight: 2, amount: 1n, sender: 20n }]);
    expect(recording.transactions[0].blockheight).toBe(2);
  });

  it("records the mutated blockheight from sendTransactionAndGetResponse", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().sendTransactionAndGetResponse([{ amount: 1n, sender: 30n }]);
    // Captured after the call, so it carries the height the testbed stamped on.
    expect(recording.transactions[0].blockheight).toBe(7);
  });

  it("keeps the underlying return values intact for chaining", () => {
    const { Recorded } = createRecorder(FakeTestbed as any);
    const instance = new Recorded();
    expect(instance.loadContract("x").runScenario()).toBe(instance);
  });

  it("records multiple contracts, last loaded is the active one", () => {
    const { Recorded, recording } = createRecorder(FakeTestbed as any);
    new Recorded().loadContract("first").loadContract("second");
    expect(recording.contractSource).toBe("second");
    expect(recording.allContractSources).toEqual(["first", "second"]);
  });
});
