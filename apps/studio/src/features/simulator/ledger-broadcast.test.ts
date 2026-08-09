import { describe, it, expect } from "bun:test";
import { createLedgerHost, subscribeLedger, type ChannelLike } from "./ledger-broadcast";
import type { LedgerState } from "./engine/engine.types";

// A synchronous in-memory bus: postMessage delivers to every *other* open channel.
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

const L = (block: number): LedgerState => ({ currentBlock: block, accounts: [], transactions: [] });

describe("ledger-broadcast", () => {
  it("a subscriber that connects after a publish receives the latest snapshot", () => {
    const bus = makeBus();
    const host = createLedgerHost(bus);
    host.publish(L(1));
    let received: LedgerState | null = null;
    subscribeLedger((l) => (received = l), bus);
    expect(received).toEqual(L(1));
  });

  it("later publishes reach the subscriber", () => {
    const bus = makeBus();
    const host = createLedgerHost(bus);
    let received: LedgerState | null = null;
    subscribeLedger((l) => (received = l), bus);
    host.publish(L(5));
    expect(received).toEqual(L(5));
  });

  it("unsubscribe stops delivery", () => {
    const bus = makeBus();
    const host = createLedgerHost(bus);
    let count = 0;
    const off = subscribeLedger(() => count++, bus);
    host.publish(L(1));
    off();
    host.publish(L(2));
    expect(count).toBe(1);
  });
});
