import type { DebugState, LedgerState } from "./engine/engine.types";

export interface ChannelLike {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export interface DebugSnapshot {
  state: DebugState;
  ledger: LedgerState;
}

export interface DebugHost {
  publish(snapshot: DebugSnapshot): void;
  close(): void;
}

type BroadcastMsg = { type: "snapshot"; snapshot: DebugSnapshot } | { type: "request" };

const CHANNEL = "smartc-debug";
const supported = (): boolean => typeof BroadcastChannel !== "undefined";
const defaultChannel = (): ChannelLike => new BroadcastChannel(CHANNEL) as unknown as ChannelLike;

/** Debugger tab: broadcasts snapshots and answers late subscribers' requests. */
export function createDebugHost(makeChannel: () => ChannelLike = defaultChannel): DebugHost {
  if (makeChannel === defaultChannel && !supported()) return { publish() {}, close() {} };
  const ch = makeChannel();
  let latest: DebugSnapshot | null = null;
  ch.onmessage = (ev) => {
    const m = ev.data as BroadcastMsg;
    if (m && m.type === "request" && latest) ch.postMessage({ type: "snapshot", snapshot: latest } as BroadcastMsg);
  };
  return {
    publish(snapshot) {
      latest = snapshot;
      ch.postMessage({ type: "snapshot", snapshot } as BroadcastMsg);
    },
    close() {
      ch.close();
    },
  };
}

/** Popped-out tab: requests the current snapshot on start and gets every update. */
export function subscribeDebug(
  cb: (snapshot: DebugSnapshot) => void,
  makeChannel: () => ChannelLike = defaultChannel,
): () => void {
  if (makeChannel === defaultChannel && !supported()) return () => {};
  const ch = makeChannel();
  ch.onmessage = (ev) => {
    const m = ev.data as BroadcastMsg;
    if (m && m.type === "snapshot") cb(m.snapshot);
  };
  ch.postMessage({ type: "request" } as BroadcastMsg);
  return () => ch.close();
}
