import { afterEach, describe, expect, test } from "bun:test";
import { request } from "node:http";
import { createServer } from "node:net";
import WebSocket from "ws";
import { METHODS, MISMATCH_ERROR, PROTOCOL_VERSION, TAKEN_OVER_CLOSE } from "@smartc-studio/assistant-protocol";
import { TabLink } from "./tab-link";

const ORIGIN = "http://localhost:5173";
const cleanup: Array<() => Promise<void> | void> = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
  });
}

async function startLink(allowOrigins: string[] = []) {
  const port = await freePort();
  const link = new TabLink({ port, allowOrigins });
  expect(await link.start()).toBe("listening");
  cleanup.push(() => link.stop());
  return { link, port };
}

class Tab {
  ws!: WebSocket;
  messages: any[] = [];
  private waiters: Array<() => void> = [];
  closeCode?: number;
  /** Answer to relay → tab `tool.call`; undefined = never answer. */
  onCall?: (params: any) => unknown;

  static async open(port: number, origin = ORIGIN): Promise<Tab> {
    const tab = new Tab();
    tab.ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: origin } });
    cleanup.push(() => tab.ws.close());
    tab.ws.on("message", (raw) => {
      const msg = JSON.parse(String(raw));
      tab.messages.push(msg);
      if (msg.method === METHODS.call && tab.onCall) {
        const outcome = tab.onCall(msg.params);
        if (outcome !== undefined) tab.ws.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: outcome }));
      }
      tab.waiters.splice(0).forEach((w) => w());
    });
    tab.ws.on("close", (code) => {
      tab.closeCode = code;
      tab.waiters.splice(0).forEach((w) => w());
    });
    await new Promise<void>((resolve, reject) => {
      tab.ws.once("open", () => resolve());
      tab.ws.once("error", reject);
    });
    return tab;
  }

  async waitFor<T>(find: () => T | undefined): Promise<T> {
    for (let i = 0; i < 200; i++) {
      const found = find();
      if (found !== undefined) return found;
      await new Promise<void>((resolve) => {
        this.waiters.push(resolve);
        setTimeout(resolve, 25);
      });
    }
    throw new Error("timed out waiting");
  }

  private nextId = 1;
  async request(method: string, params?: unknown): Promise<any> {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
    return this.waitFor(() => this.messages.find((m) => m.id === id && (m.result !== undefined || m.error)));
  }
  hello(supported: number[] = [PROTOCOL_VERSION]) {
    return this.request(METHODS.hello, { supported, catalogHash: "x", studioVersion: "test" });
  }
  accept(takeover = false) {
    return this.request(METHODS.accept, { takeover });
  }
  async connect() {
    await this.hello();
    await this.accept();
  }
  notified(method: string) {
    return this.waitFor(() => this.messages.find((m) => m.method === method));
  }
}

async function activeTab(port: number, link: TabLink): Promise<Tab> {
  const tab = await Tab.open(port);
  tab.onCall = (p) => ({ ok: true, data: { echoed: p.tool } });
  await tab.connect();
  expect(link.state).toBe("active");
  return tab;
}

describe("TabLink", () => {
  test("rejects a foreign origin with 403", async () => {
    const { port } = await startLink();
    // Raw upgrade request: the status line is the same on Node and Bun.
    const status = await new Promise<number>((resolve, reject) => {
      const req = request({ host: "127.0.0.1", port, headers: { Connection: "Upgrade", Upgrade: "websocket", "Sec-WebSocket-Version": "13", "Sec-WebSocket-Key": "dGhlIHNhbXBsZSBub25jZQ==", Origin: "https://evil.example" } });
      req.on("response", (res) => resolve(res.statusCode ?? 0));
      req.on("upgrade", () => resolve(101));
      req.on("error", reject);
      req.end();
    });
    expect(status).toBe(403);
  });

  test("accepts localhost and extra allowed origins", async () => {
    const { port } = await startLink(["https://x.test"]);
    await Tab.open(port, ORIGIN);
    await Tab.open(port, "https://x.test");
  });

  test("answers studio_not_connected without a tab", async () => {
    const { link } = await startLink();
    expect(link.state).toBe("idle");
    const out = await link.call("list_projects", {}, 1000);
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.error.code).toBe("studio_not_connected");
  });

  test("stays pending until accept", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    const res = await tab.hello();
    expect(res.result.occupied).toBe(false);
    expect(res.result.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(typeof res.result.catalogHash).toBe("string");
    expect(link.state).toBe("pending");
    const out = await link.call("list_projects", {}, 1000);
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("studio_not_connected");
    expect(out.error.hint).toContain("allow the connection");
  });

  test("forwards a call and returns the tab's outcome", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    tab.onCall = () => ({ ok: true, data: { x: 1 } });
    await tab.connect();
    const out = await link.call("list_projects", {}, 1000);
    expect(out).toEqual({ ok: true, data: { x: 1 } });
    const req = tab.messages.find((m) => m.method === METHODS.call);
    expect(req.params).toEqual({ tool: "list_projects", args: {} });
  });

  test("returns a tab failure outcome unchanged", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    const error = { code: "file_not_found" as const, message: "no", hint: "h" };
    tab.onCall = () => ({ ok: false, error });
    await tab.connect();
    expect(await link.call("list_projects", {}, 1000)).toEqual({ ok: false, error });
  });

  test("denied until the next hello", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    tab.onCall = () => ({ ok: true, data: 1 });
    await tab.hello();
    tab.ws.send(JSON.stringify({ jsonrpc: "2.0", method: METHODS.deny }));
    await tab.waitFor(() => (link.state === "denied" ? true : undefined));
    const out = await link.call("list_projects", {}, 1000);
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("rejected_by_user");
    await tab.hello();
    await tab.accept();
    expect(await link.call("list_projects", {}, 1000)).toEqual({ ok: true, data: 1 });
  });

  test("occupied hello and takeover", async () => {
    const { link, port } = await startLink();
    const a = await Tab.open(port);
    a.onCall = () => undefined; // never answers
    await a.connect();
    const inflight = link.call("list_projects", {}, 5000);
    await a.waitFor(() => a.messages.find((m) => m.method === METHODS.call));

    const b = await Tab.open(port);
    b.onCall = () => ({ ok: true, data: "b" });
    const res = await b.hello();
    expect(res.result.occupied).toBe(true);
    expect(link.state).toBe("active");
    await b.accept(true);

    await a.notified(METHODS.takenOver);
    await a.waitFor(() => (a.closeCode !== undefined ? true : undefined));
    expect(a.closeCode).toBe(TAKEN_OVER_CLOSE);
    const out = await inflight;
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("studio_disconnected");
    expect(await link.call("list_projects", {}, 1000)).toEqual({ ok: true, data: "b" });
  });

  test("a denied takeover keeps the active tab", async () => {
    const { link, port } = await startLink();
    const a = await activeTab(port, link);
    const b = await Tab.open(port);
    await b.hello();
    b.ws.send(JSON.stringify({ jsonrpc: "2.0", method: METHODS.deny }));
    await new Promise((r) => setTimeout(r, 50));
    expect(link.state).toBe("active");
    expect(await link.call("list_projects", {}, 1000)).toEqual({ ok: true, data: { echoed: "list_projects" } });
    expect(a.closeCode).toBeUndefined();
  });

  test("fails in-flight calls when the tab goes away", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    tab.onCall = () => undefined;
    await tab.connect();
    const inflight = link.call("list_projects", {}, 5000);
    await tab.waitFor(() => tab.messages.find((m) => m.method === METHODS.call));
    tab.ws.close();
    const out = await inflight;
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("studio_disconnected");
    await new Promise((r) => setTimeout(r, 50));
    expect(link.state).toBe("idle");
  });

  test("accepts a new tab after disconnect", async () => {
    const { link, port } = await startLink();
    const a = await activeTab(port, link);
    a.ws.close();
    await a.waitFor(() => (link.state === "idle" ? true : undefined));
    const b = await Tab.open(port);
    b.onCall = () => ({ ok: true, data: "b" });
    const res = await b.hello();
    expect(res.result.occupied).toBe(false);
    await b.accept();
    expect(await link.call("list_projects", {}, 1000)).toEqual({ ok: true, data: "b" });
  });

  test("a newer hello replaces a pending socket", async () => {
    const { link, port } = await startLink();
    const a = await Tab.open(port);
    await a.hello();
    const b = await Tab.open(port);
    b.onCall = () => ({ ok: true, data: "b" });
    await b.hello();
    await a.waitFor(() => (a.closeCode !== undefined ? true : undefined));
    await b.accept();
    expect(await link.call("list_projects", {}, 1000)).toEqual({ ok: true, data: "b" });
  });

  test("times out when the tab never answers", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    tab.onCall = () => undefined;
    await tab.connect();
    const out = await link.call("list_projects", {}, 50);
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("timeout");
  });

  test("protocol mismatch: relay older than the Studio", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    const res = await tab.hello([2]);
    expect(res.error.code).toBe(MISMATCH_ERROR);
    expect(res.error.data).toEqual({ relayVersion: PROTOCOL_VERSION });
    expect(link.state).toBe("mismatch");
    const out = await link.call("list_projects", {}, 1000);
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("protocol_mismatch");
    expect(out.error.hint).toContain("npx @smartc-studio/mcp@latest");
  });

  test("protocol mismatch: relay newer than the Studio", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    const res = await tab.hello([0]);
    expect(res.error.code).toBe(MISMATCH_ERROR);
    const out = await link.call("list_projects", {}, 1000);
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("protocol_mismatch");
    expect(out.error.hint).toContain("reload the Studio tab");
  });

  test("busy port: start resolves busy and calls answer another_session_connected", async () => {
    const { port } = await startLink();
    const second = new TabLink({ port, allowOrigins: [] });
    cleanup.push(() => second.stop());
    expect(await second.start()).toBe("busy");
    expect(second.state).toBe("busy");
    const out = await second.call("list_projects", {}, 1000);
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("another_session_connected");
  });

  test("forwards clientInfo in hello and as session.client after accept", async () => {
    const { link, port } = await startLink();
    link.setClient({ name: "Claude Code", version: "1" });
    const tab = await Tab.open(port);
    const res = await tab.hello();
    expect(res.result.client).toEqual({ name: "Claude Code", version: "1" });
    await tab.accept();
    const n = await tab.notified(METHODS.client);
    expect(n.params).toEqual({ client: { name: "Claude Code", version: "1" } });
  });

  test("setClient after the tab is active notifies it", async () => {
    const { link, port } = await startLink();
    const tab = await activeTab(port, link);
    link.setClient({ name: "Cursor", version: "2" });
    const n = await tab.notified(METHODS.client);
    expect(n.params).toEqual({ client: { name: "Cursor", version: "2" } });
  });

  test("hello reports client null before setClient", async () => {
    const { port } = await startLink();
    const tab = await Tab.open(port);
    expect((await tab.hello()).result.client).toBeNull();
  });

  test("ignores malformed frames and messages before hello", async () => {
    const { link, port } = await startLink();
    const tab = await Tab.open(port);
    tab.ws.send("not json{");
    tab.ws.send(JSON.stringify({ jsonrpc: "2.0", id: 99, result: { ok: true, data: 1 } }));
    tab.ws.send(JSON.stringify({ jsonrpc: "2.0", method: "bogus" }));
    tab.ws.send(JSON.stringify([1, 2]));
    tab.ws.send("null");
    const accept = await tab.accept(); // accept before hello
    expect(accept.error).toBeDefined();
    expect(link.state).toBe("idle");
    // relay still works
    tab.onCall = () => ({ ok: true, data: 1 });
    await tab.connect();
    expect(await link.call("list_projects", {}, 1000)).toEqual({ ok: true, data: 1 });
  });

  test("stop fails in-flight calls and closes tabs", async () => {
    const port = await freePort();
    const link = new TabLink({ port, allowOrigins: [] });
    await link.start();
    const tab = await Tab.open(port);
    tab.onCall = () => undefined;
    await tab.connect();
    const inflight = link.call("list_projects", {}, 5000);
    await tab.waitFor(() => tab.messages.find((m) => m.method === METHODS.call));
    await link.stop();
    const out = await inflight;
    if (out.ok) throw new Error("expected failure");
    expect(out.error.code).toBe("studio_disconnected");
  });
});
