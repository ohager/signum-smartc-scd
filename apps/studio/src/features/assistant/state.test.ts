import { describe, expect, it } from "bun:test";
import { createStore } from "jotai";
import { connectionStateAtom, recordConnectionState, setupDoneAtom } from "./state";

describe("recordConnectionState", () => {
  it("mirrors the connection state", () => {
    const store = createStore();
    recordConnectionState(store, { kind: "connecting", port: 6890 });
    expect(store.get(connectionStateAtom)).toEqual({ kind: "connecting", port: 6890 });
  });

  it("marks setup done on the first real connection", () => {
    const store = createStore();
    recordConnectionState(store, { kind: "failed", reason: "unreachable" });
    expect(store.get(setupDoneAtom)).toBe(false);
    recordConnectionState(store, { kind: "connected", client: null });
    expect(store.get(setupDoneAtom)).toBe(true);
  });

  it("keeps setup done after a disconnect", () => {
    const store = createStore();
    recordConnectionState(store, { kind: "connected", client: null });
    recordConnectionState(store, { kind: "idle" });
    expect(store.get(setupDoneAtom)).toBe(true);
  });
});
