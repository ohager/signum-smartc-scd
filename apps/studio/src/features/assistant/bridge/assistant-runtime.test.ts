import { createEditorRegistry } from "../editor-registry";
import { createEditorTools } from "../tools/editor-tools";
import { describe, it, expect } from "bun:test";
import { METHODS } from "@smartc-studio/assistant-protocol";
import { MemoryCheckpointStore } from "../rounds/checkpoints";
import { createTestFs } from "../tools/test-fs";
import type { SocketLike } from "./rpc";
import { createAssistantRuntime } from "./assistant-runtime";

/*
 * The relay side of the wire, scripted: answers hello/accept like the real relay and
 * lets the test push `tool.call` requests as the agent would.
 */
function fakeRelay() {
  let sock!: SocketLike;
  let nextId = 1000;
  const waiting = new Map<number, (r: any) => void>();
  const openSocket = (_url: string): SocketLike => {
    sock = {
      onopen: null,
      onmessage: null,
      onclose: null,
      onerror: null,
      close() {},
      send(data) {
        const msg = JSON.parse(data);
        if (msg.method === METHODS.hello) {
          queueMicrotask(() => sock.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { client: { name: "Inspector", version: "1" }, occupied: false } }) }));
        } else if (msg.method === METHODS.accept) {
          queueMicrotask(() => sock.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: {} }) }));
        } else if (typeof msg.id === "number" && waiting.has(msg.id)) {
          waiting.get(msg.id)!(msg.result);
        }
      },
    };
    queueMicrotask(() => sock.onopen?.());
    return sock;
  };
  const call = (tool: string, args: unknown = {}) =>
    new Promise<any>((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      sock.onmessage?.({ data: JSON.stringify({ jsonrpc: "2.0", id, method: METHODS.call, params: { tool, args } }) });
    });
  return { openSocket, call };
}

async function until(cond: () => boolean) {
  for (let i = 0; i < 200 && !cond(); i++) await new Promise((r) => setTimeout(r, 2));
  if (!cond()) throw new Error("timeout");
}

async function setup() {
  const { fs } = createTestFs();
  const p = await fs.createFolder(fs.rootFolderId, "p");
  await fs.addFile(p, "a.ts", "test", "one");
  const relay = fakeRelay();
  const locked = new Set<string>();
  const timers: unknown[] = [];
  const runtime = createAssistantRuntime({
    fs,
    checkpointStore: new MemoryCheckpointStore(),
    clock: { now: () => Date.now(), setTimeout: (fn, ms) => (timers.push(fn), timers.length), clearTimeout: () => {} },
    openSocket: relay.openSocket,
    flush: async () => {},
    lock: (id) => void locked.add(id),
    unlock: (id) => void locked.delete(id),
    catalogHash: "h",
    studioVersion: "test",
    editor: createEditorTools({ registry: createEditorRegistry(), navigate: () => {}, fs }),
    tools: {
      loadLabelMaps: async () => [],
      lint: async () => ({}) as never,
      gas: async () => ({}) as never,
      execute: async () => ({}) as never,
      recordVerdicts: () => {},
    },
  });
  runtime.connection.connect(6890);
  await until(() => runtime.connection.state.kind === "awaiting-approval");
  runtime.connection.allow();
  await until(() => runtime.connection.state.kind === "connected");
  return { runtime, relay, locked, p };
}

describe("createAssistantRuntime", () => {
  it("connect + allow serves list_projects end-to-end", async () => {
    const { relay } = await setup();
    const out = await relay.call("list_projects");
    expect(out.ok).toBe(true);
    expect(JSON.stringify(out.data)).toContain('"p"');
  });

  it("disconnect ends rounds and clears locks", async () => {
    const { runtime, relay, locked, p } = await setup();
    const ended: string[] = [];
    runtime.events.subscribe({ onRoundEnded: (e) => void ended.push(e.reason) });
    expect((await relay.call("write_file", { path: "/p/a.ts", content: "two" })).ok).toBe(true);
    expect(locked.has(p)).toBe(true);
    runtime.connection.disconnect();
    await until(() => locked.size === 0);
    expect(ended).toEqual(["disconnect"]);
  });

  it("takeOver(projectId) unlocks and the next write gets user_took_over", async () => {
    const { runtime, relay, locked, p } = await setup();
    await relay.call("write_file", { path: "/p/a.ts", content: "two" });
    expect(locked.has(p)).toBe(true);
    await runtime.takeOver(p);
    expect(locked.has(p)).toBe(false);
    const out = await relay.call("write_file", { path: "/p/a.ts", content: "three" });
    expect(out.ok).toBe(false);
    expect(out.error.code).toBe("user_took_over");
  });

  it("after a restore and after its undo, the agent's next write gets user_took_over", async () => {
    const { runtime, relay, p } = await setup();
    let roundId = "";
    runtime.events.subscribe({ onRoundStarted: (e) => void (roundId = e.roundId) });
    await relay.call("write_file", { path: "/p/a.ts", content: "two" });
    await runtime.takeOver(p);
    expect((await relay.call("write_file", { path: "/p/a.ts", content: "x" })).error.code).toBe("user_took_over");

    const { undoCheckpointId } = await (await runtime.restoreRound(roundId)).confirm();
    expect((await relay.call("write_file", { path: "/p/a.ts", content: "three" })).error.code).toBe("user_took_over");

    await runtime.undoRestore(undoCheckpointId);
    expect((await relay.call("write_file", { path: "/p/a.ts", content: "four" })).error.code).toBe("user_took_over");
    expect((await relay.call("write_file", { path: "/p/a.ts", content: "five" })).ok).toBe(true);
  });
});
