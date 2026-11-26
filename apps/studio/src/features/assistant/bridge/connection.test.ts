import { describe, expect, test } from "bun:test";
import { DEFAULT_HINTS, METHODS, MISMATCH_ERROR, TAKEN_OVER_CLOSE, type ToolOutcome } from "@smartc-studio/assistant-protocol";
import { AssistantConnection, relayUrl, type ConnectionState } from "./connection";
import type { SocketLike } from "./rpc";

class FakeSocket implements SocketLike {
  sent: any[] = [];
  closedWith: number | undefined | "never" = "never";
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: ((e: { code: number }) => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(readonly url: string) {}
  send(d: string) {
    this.sent.push(JSON.parse(d));
  }
  close(code?: number) {
    this.closedWith = code;
  }
  // relay side
  open() {
    this.onopen?.();
  }
  push(m: unknown) {
    this.onmessage?.({ data: JSON.stringify(m) });
  }
  dropped(code = 1006) {
    this.onclose?.({ code });
  }
  lastRequest(method: string) {
    return [...this.sent].reverse().find((m) => m.method === method);
  }
  reply(method: string, result: unknown) {
    this.push({ jsonrpc: "2.0", id: this.lastRequest(method).id, result });
  }
  replyError(method: string, code: number, data?: unknown) {
    this.push({ jsonrpc: "2.0", id: this.lastRequest(method).id, error: { code, message: "err", data } });
  }
  hello(client: { name: string; version: string } | null = { name: "Claude Code", version: "1" }, occupied = false) {
    this.open();
    this.reply(METHODS.hello, { protocolVersion: 1, catalogHash: "h", client, occupied });
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

function setup(opts: { onCall?: (t: string, a: unknown) => Promise<ToolOutcome>; catalogHash?: string } = {}) {
  const sockets: FakeSocket[] = [];
  const warnings: string[] = [];
  const timers: { fn: () => void; ms: number; id: number; live: boolean }[] = [];
  let nextTimer = 1;
  const states: ConnectionState[] = [];
  let disconnected = 0;
  const conn = new AssistantConnection({
    openSocket: (url) => {
      const s = new FakeSocket(url);
      sockets.push(s);
      return s;
    },
    onCall: opts.onCall ?? (async (tool, args) => ({ ok: true, data: { tool, args } })),
    onDisconnected: () => void disconnected++,
    studioVersion: "9.9.9",
    catalogHash: opts.catalogHash ?? "hash123",
    warn: (m) => void warnings.push(m),
    setTimeout: (fn, ms) => {
      const t = { fn, ms, id: nextTimer++, live: true };
      timers.push(t);
      return t.id as any;
    },
    clearTimeout: (id) => {
      const t = timers.find((x) => x.id === (id as any));
      if (t) t.live = false;
    },
  });
  conn.subscribe((s) => states.push(s));
  const fire = () => {
    const t = timers.find((x) => x.live)!;
    t.live = false;
    t.fn();
    return t.ms;
  };
  /* Fires the live timer with exactly this delay (handshake timeouts sit beside backoff timers). */
  const fireMs = (ms: number) => {
    const t = timers.find((x) => x.live && x.ms === ms)!;
    t.live = false;
    t.fn();
  };
  const live = () => timers.filter((t) => t.live);
  return { conn, sockets, timers, states, fire, fireMs, live, warnings, disconnected: () => disconnected, last: () => sockets[sockets.length - 1]! };
}

async function connected(h = setup()) {
  h.conn.connect(6890);
  h.last().hello();
  await tick();
  h.conn.allow();
  h.last().reply(METHODS.accept, { ok: true });
  await tick();
  expect(h.conn.state.kind).toBe("connected");
  return h;
}

describe("relayUrl", () => {
  test("is the single place that builds the URL", () => {
    expect(relayUrl(6890)).toBe("ws://127.0.0.1:6890");
  });
});

describe("AssistantConnection", () => {
  test("hello carries supported versions, catalog hash and studio version; reply moves to awaiting-approval", async () => {
    const h = setup();
    h.conn.connect(6890);
    expect(h.conn.state).toEqual({ kind: "connecting", port: 6890 });
    expect(h.last().url).toBe("ws://127.0.0.1:6890");
    h.last().open();
    expect(h.last().lastRequest(METHODS.hello).params).toEqual({ supported: [1], catalogHash: "hash123", studioVersion: "9.9.9" });
    h.last().reply(METHODS.hello, { protocolVersion: 1, catalogHash: "h", client: { name: "Claude Code", version: "1" }, occupied: false });
    await tick();
    expect(h.conn.state).toEqual({ kind: "awaiting-approval", client: { name: "Claude Code", version: "1" }, occupied: false });
  });

  test("allow sends accept and reaches connected", async () => {
    const h = await connected();
    expect(h.last().lastRequest(METHODS.accept).params).toEqual({ takeover: false });
  });

  test("deny sends session.deny, goes idle and does not reconnect", async () => {
    const h = setup();
    h.conn.connect(6890);
    h.last().hello();
    await tick();
    h.conn.deny();
    expect(h.last().lastRequest(METHODS.deny)).toBeDefined();
    expect(h.conn.state.kind).toBe("idle");
    h.last().dropped();
    expect(h.conn.state.kind).toBe("idle");
    expect(h.live()).toHaveLength(0);
  });

  describe("handshake timeouts and cancel", () => {
    test("hello unanswered for 10 s fails as closed and ignores a late reply", async () => {
      const h = setup();
      h.conn.connect(6890);
      h.last().open();
      expect(h.live().map((t) => t.ms)).toEqual([10_000]);
      h.fireMs(10_000);
      expect(h.conn.state).toEqual({ kind: "failed", reason: "closed" });
      expect(h.last().closedWith).not.toBe("never");
      h.last().reply(METHODS.hello, { protocolVersion: 1, catalogHash: "hash123", client: null, occupied: false });
      await tick();
      expect(h.conn.state).toEqual({ kind: "failed", reason: "closed" });
      expect(h.live()).toHaveLength(0);
    });

    test("accept unanswered for 10 s fails as closed", async () => {
      const h = setup();
      h.conn.connect(6890);
      h.last().hello();
      await tick();
      expect(h.live()).toHaveLength(0);
      h.conn.allow();
      expect(h.live().map((t) => t.ms)).toEqual([10_000]);
      h.fireMs(10_000);
      expect(h.conn.state).toEqual({ kind: "failed", reason: "closed" });
      h.last().reply(METHODS.accept, { ok: true });
      await tick();
      expect(h.conn.state).toEqual({ kind: "failed", reason: "closed" });
    });

    test("answered handshakes leave no timer behind", async () => {
      const h = await connected();
      expect(h.live()).toHaveLength(0);
    });

    test("cancel while connecting goes idle and closes the socket", async () => {
      const h = setup();
      h.conn.connect(6890);
      h.last().open();
      h.conn.disconnect();
      expect(h.conn.state.kind).toBe("idle");
      expect(h.last().closedWith).not.toBe("never");
      expect(h.live()).toHaveLength(0);
    });

    test("deny while the accept is pending cancels it: a late accept reply does not connect", async () => {
      const h = setup();
      h.conn.connect(6890);
      h.last().hello();
      await tick();
      h.conn.allow();
      h.conn.deny();
      expect(h.conn.state.kind).toBe("idle");
      h.last().reply(METHODS.accept, { ok: true });
      await tick();
      expect(h.conn.state.kind).toBe("idle");
      expect(h.live()).toHaveLength(0);
    });
  });

  describe("catalog hash", () => {
    test("warns once when the relay's catalog hash differs, and still connects", async () => {
      const h = await connected(setup({ catalogHash: "mine" }));
      expect(h.warnings).toHaveLength(1);
      expect(h.warnings[0]).toContain("mine");
      h.last().dropped();
      h.fire();
      h.last().hello();
      await tick();
      expect(h.warnings).toHaveLength(1);
    });

    test("does not warn when the hashes match", async () => {
      const h = await connected(setup({ catalogHash: "h" }));
      expect(h.warnings).toEqual([]);
    });
  });

  test("occupied: allow sends takeover true", async () => {
    const h = setup();
    h.conn.connect(6890);
    h.last().hello({ name: "Codex", version: "2" }, true);
    await tick();
    expect(h.conn.state).toMatchObject({ kind: "awaiting-approval", occupied: true });
    h.conn.allow();
    expect(h.last().lastRequest(METHODS.accept).params).toEqual({ takeover: true });
  });

  test("session.client updates the shown client", async () => {
    const h = await connected();
    h.last().push({ jsonrpc: "2.0", method: METHODS.client, params: { client: { name: "Codex", version: "3" } } });
    expect(h.conn.state).toEqual({ kind: "connected", client: { name: "Codex", version: "3" } });
    expect(h.disconnected()).toBe(0);
  });

  test("serves tool.call only when connected", async () => {
    const calls: unknown[] = [];
    const h = setup({
      onCall: async (tool, args) => {
        calls.push([tool, args]);
        return { ok: true, data: 1 };
      },
    });
    h.conn.connect(6890);
    h.last().hello();
    await tick();
    h.last().push({ jsonrpc: "2.0", id: 5, method: METHODS.call, params: { tool: "list_projects", args: {} } });
    await tick();
    expect(calls).toHaveLength(0);
    expect(h.last().sent.find((m) => m.id === 5).result).toEqual({
      ok: false,
      error: { code: "studio_not_connected", message: expect.any(String), hint: DEFAULT_HINTS.studio_not_connected },
    });
    h.conn.allow();
    h.last().reply(METHODS.accept, { ok: true });
    await tick();
    h.last().push({ jsonrpc: "2.0", id: 6, method: METHODS.call, params: { tool: "list_projects", args: { a: 1 } } });
    await tick();
    expect(calls).toEqual([["list_projects", { a: 1 }]]);
    expect(h.last().sent.find((m) => m.id === 6).result).toEqual({ ok: true, data: 1 });
  });

  test("a throwing onCall is answered with an internal outcome, never a JSON-RPC error", async () => {
    const h = await connected(
      setup({
        onCall: async () => {
          throw new Error("kaboom");
        },
      }),
    );
    h.last().push({ jsonrpc: "2.0", id: 8, method: METHODS.call, params: { tool: "x", args: {} } });
    await tick();
    const reply = h.last().sent.find((m) => m.id === 8);
    expect(reply.error).toBeUndefined();
    expect(reply.result).toMatchObject({ ok: false, error: { code: "internal", hint: DEFAULT_HINTS.internal } });
  });

  test("taken over: state, onDisconnected once, no reconnect", async () => {
    const h = await connected();
    h.last().push({ jsonrpc: "2.0", method: METHODS.takenOver });
    expect(h.conn.state.kind).toBe("taken-over");
    h.last().dropped(TAKEN_OVER_CLOSE);
    expect(h.conn.state.kind).toBe("taken-over");
    expect(h.disconnected()).toBe(1);
    expect(h.live()).toHaveLength(0);
  });

  test("close code 4001 alone also means taken over", async () => {
    const h = await connected();
    h.last().dropped(TAKEN_OVER_CLOSE);
    expect(h.conn.state.kind).toBe("taken-over");
    expect(h.live()).toHaveLength(0);
  });

  test("mismatch: relay newer than supported asks to reload Studio", async () => {
    const h = setup();
    h.conn.connect(6890);
    h.last().open();
    h.last().replyError(METHODS.hello, MISMATCH_ERROR, { relayVersion: 2 });
    await tick();
    expect(h.conn.state).toEqual({ kind: "mismatch", action: "reload-studio" });
    h.last().dropped();
    expect(h.live()).toHaveLength(0);
  });

  test("mismatch: relay older asks to update the relay", async () => {
    const h = setup();
    h.conn.connect(6890);
    h.last().open();
    h.last().replyError(METHODS.hello, MISMATCH_ERROR, { relayVersion: 0 });
    await tick();
    expect(h.conn.state).toEqual({ kind: "mismatch", action: "update-relay" });
  });

  test("a first connect that never opens is unreachable, without retry", async () => {
    const h = setup();
    h.conn.connect(6890);
    h.last().onerror?.();
    h.last().dropped();
    expect(h.conn.state).toEqual({ kind: "failed", reason: "unreachable" });
    expect(h.live()).toHaveLength(0);
  });

  test("unexpected close reconnects with 1s, 2s, 5s backoff, then failed: closed", async () => {
    const h = await connected();
    h.last().dropped();
    expect(h.conn.state.kind).toBe("connecting");
    expect(h.disconnected()).toBe(1);
    expect(h.fire()).toBe(1000);
    expect(h.sockets).toHaveLength(2);
    h.last().dropped(); // never opened
    expect(h.fire()).toBe(2000);
    h.last().dropped();
    expect(h.fire()).toBe(5000);
    h.last().dropped();
    expect(h.conn.state).toEqual({ kind: "failed", reason: "closed" });
    expect(h.timers.filter((t) => t.live)).toHaveLength(0);
    expect(h.disconnected()).toBe(1);
  });

  test("reconnect re-accepts automatically when the user had allowed, relay is free and client is the same", async () => {
    const h = await connected();
    h.last().dropped();
    h.fire();
    h.last().hello({ name: "Claude Code", version: "1" }, false);
    await tick();
    expect(h.last().lastRequest(METHODS.accept).params).toEqual({ takeover: false });
    h.last().reply(METHODS.accept, { ok: true });
    await tick();
    expect(h.conn.state.kind).toBe("connected");
  });

  test.each([
    ["relay occupied", { name: "Claude Code", version: "1" }, true],
    ["different client", { name: "Codex", version: "1" }, false],
  ] as const)("reconnect asks again when %s", async (_n, client, occupied) => {
    const h = await connected();
    h.last().dropped();
    h.fire();
    h.last().hello({ ...client }, occupied);
    await tick();
    expect(h.last().lastRequest(METHODS.accept)).toBeUndefined();
    expect(h.conn.state).toMatchObject({ kind: "awaiting-approval", occupied });
  });

  test("unexpected close while awaiting approval also reconnects, and asks again", async () => {
    const h = setup();
    h.conn.connect(6890);
    h.last().hello();
    await tick();
    h.last().dropped();
    expect(h.conn.state.kind).toBe("connecting");
    h.fire();
    h.last().hello();
    await tick();
    expect(h.last().lastRequest(METHODS.accept)).toBeUndefined();
    expect(h.conn.state.kind).toBe("awaiting-approval");
  });

  test("disconnect goes idle, fires onDisconnected once, cancels timers and never reconnects", async () => {
    const h = await connected();
    h.conn.disconnect();
    expect(h.conn.state.kind).toBe("idle");
    expect(h.disconnected()).toBe(1);
    h.last().dropped();
    h.conn.disconnect();
    expect(h.disconnected()).toBe(1);
    expect(h.live()).toHaveLength(0);
  });

  test("disconnect during backoff cancels the pending retry", async () => {
    const h = await connected();
    h.last().dropped();
    h.conn.disconnect();
    expect(h.timers.filter((t) => t.live)).toHaveLength(0);
  });

  test("subscribe emits changes, unsubscribes, and survives a throwing listener", async () => {
    const h = setup();
    const seen: string[] = [];
    h.conn.subscribe(() => {
      throw new Error("bad listener");
    });
    const off = h.conn.subscribe((s) => seen.push(s.kind));
    h.conn.connect(6890);
    expect(seen).toEqual(["connecting"]);
    off();
    h.last().hello();
    await tick();
    expect(seen).toEqual(["connecting"]);
  });

  test("connect while active replaces the old socket without callbacks from it", async () => {
    const h = await connected();
    const old = h.last();
    h.conn.connect(7000);
    expect(old.closedWith).not.toBe("never");
    expect(h.disconnected()).toBe(1);
    old.dropped();
    expect(h.conn.state).toEqual({ kind: "connecting", port: 7000 });
  });
});
