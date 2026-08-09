import { describe, it, expect } from "bun:test";
import { createDebugHost, subscribeDebug, type ChannelLike, type DebugSnapshot } from "./debug-broadcast";

function makeBus(): () => ChannelLike {
  const channels: FakeChannel[] = [];
  class FakeChannel implements ChannelLike {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    closed = false;
    constructor() {
      channels.push(this);
    }
    postMessage(msg: unknown) {
      for (const c of channels) if (c !== this && !c.closed) c.onmessage?.({ data: msg });
    }
    close() {
      this.closed = true;
    }
  }
  return () => new FakeChannel();
}

const snap = (block: number): DebugSnapshot => ({
  state: {
    instructionPointer: 0,
    currentSourceLine: 1,
    currentBlock: block,
    memory: {},
    registers: {},
    balance: "0",
    emittedTx: [],
    status: "running",
    steps: 0,
    breakpoints: [],
  },
  ledger: { currentBlock: block, accounts: [], transactions: [] },
});

describe("debug-broadcast", () => {
  it("a subscriber that connects after a publish receives the latest snapshot", () => {
    const bus = makeBus();
    const host = createDebugHost(bus);
    host.publish(snap(1));
    const got: DebugSnapshot[] = [];
    subscribeDebug((s) => got.push(s), bus);
    expect(got[got.length - 1]).toEqual(snap(1));
  });

  it("later publishes reach the subscriber", () => {
    const bus = makeBus();
    const host = createDebugHost(bus);
    const got: DebugSnapshot[] = [];
    subscribeDebug((s) => got.push(s), bus);
    host.publish(snap(5));
    expect(got[got.length - 1]).toEqual(snap(5));
  });

  it("unsubscribe stops delivery", () => {
    const bus = makeBus();
    const host = createDebugHost(bus);
    let count = 0;
    const off = subscribeDebug(() => count++, bus);
    host.publish(snap(1));
    off();
    host.publish(snap(2));
    expect(count).toBe(1);
  });
});
