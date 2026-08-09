import type { LedgerState } from "./engine/engine.types";

export interface ChannelLike {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export interface LedgerHost {
  publish(ledger: LedgerState): void;
  close(): void;
}

type BroadcastMsg = { type: "ledger"; ledger: LedgerState } | { type: "request" };

const CHANNEL = "smartc-ledger";
const supported = (): boolean => typeof BroadcastChannel !== "undefined";
const defaultChannel = (): ChannelLike => new BroadcastChannel(CHANNEL) as unknown as ChannelLike;

/** Debugger tab: broadcasts ledger snapshots and answers late subscribers' requests. */
export function createLedgerHost(makeChannel: () => ChannelLike = defaultChannel): LedgerHost {
  if (makeChannel === defaultChannel && !supported()) return { publish() {}, close() {} };
  const ch = makeChannel();
  let latest: LedgerState | null = null;
  ch.onmessage = (ev) => {
    const m = ev.data as BroadcastMsg;
    if (m && m.type === "request" && latest) ch.postMessage({ type: "ledger", ledger: latest } as BroadcastMsg);
  };
  return {
    publish(ledger) {
      latest = ledger;
      ch.postMessage({ type: "ledger", ledger } as BroadcastMsg);
    },
    close() {
      ch.close();
    },
  };
}

/** Popped-out tab: requests the current ledger on start and gets every update. */
export function subscribeLedger(
  cb: (ledger: LedgerState) => void,
  makeChannel: () => ChannelLike = defaultChannel,
): () => void {
  if (makeChannel === defaultChannel && !supported()) return () => {};
  const ch = makeChannel();
  ch.onmessage = (ev) => {
    const m = ev.data as BroadcastMsg;
    if (m && m.type === "ledger") cb(m.ledger);
  };
  ch.postMessage({ type: "request" } as BroadcastMsg);
  return () => ch.close();
}
