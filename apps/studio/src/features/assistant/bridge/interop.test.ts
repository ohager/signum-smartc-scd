import { afterEach, describe, expect, test } from "bun:test";
import { createServer } from "node:net";
import type { ToolName } from "@smartc-studio/assistant-protocol";
/*
 * Cross-package on purpose: the relay is the counterpart the bridge must match
 * byte for byte, so this test drives the real TabLink instead of a hand-written fake.
 */
import { TabLink } from "../../../../../../packages/studio-mcp/src/tab-link";
import { AssistantConnection } from "./connection";
import type { SocketLike } from "./rpc";

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

async function until(cond: () => boolean, ms = 3000) {
  const end = Date.now() + ms;
  while (!cond()) {
    if (Date.now() > end) throw new Error("timeout waiting for condition");
    await new Promise((r) => setTimeout(r, 5));
  }
}

function tab(port: number, calls: unknown[] = []) {
  let disconnected = 0;
  const conn = new AssistantConnection({
    openSocket: (url) => {
      // The relay enforces an Origin allowlist; a browser sends it, Bun needs it spelled out.
      const ws = new (WebSocket as any)(url, { headers: { Origin: "http://localhost:3000" } });
      return ws as SocketLike;
    },
    onCall: async (tool, args) => {
      calls.push([tool, args]);
      return { ok: true, data: { echoed: tool } };
    },
    onDisconnected: () => void disconnected++,
    studioVersion: "test",
    catalogHash: "irrelevant",
  });
  cleanup.push(() => conn.disconnect());
  conn.connect(port);
  return { conn, disconnected: () => disconnected };
}

async function relay() {
  const port = await freePort();
  // The tab connects from a localhost origin, so the relay runs as --dev.
  const link = new TabLink({ port, allowOrigins: [], allowLocalhost: true });
  expect(await link.start()).toBe("listening");
  cleanup.push(() => link.stop());
  return { link, port };
}

describe("bridge against the real relay", () => {
  test("hello -> accept -> tool.call round trip, with the client name", async () => {
    const { link, port } = await relay();
    link.setClient({ name: "Claude Code", version: "1.2" });
    const calls: unknown[] = [];
    const { conn } = tab(port, calls);
    await until(() => conn.state.kind === "awaiting-approval");
    expect(conn.state).toEqual({ kind: "awaiting-approval", client: { name: "Claude Code", version: "1.2" }, occupied: false });

    expect(await link.call("list_projects" as ToolName, {}, 500)).toMatchObject({ ok: false, error: { code: "studio_not_connected" } });

    conn.allow();
    await until(() => conn.state.kind === "connected");
    expect(await link.call("list_projects" as ToolName, { a: 1 }, 1000)).toEqual({ ok: true, data: { echoed: "list_projects" } });
    expect(calls).toEqual([["list_projects", { a: 1 }]]);
  });

  test("deny makes the relay answer rejected_by_user", async () => {
    const { link, port } = await relay();
    const { conn } = tab(port);
    await until(() => conn.state.kind === "awaiting-approval");
    conn.deny();
    await new Promise((r) => setTimeout(r, 50));
    expect(await link.call("list_projects" as ToolName, {}, 500)).toMatchObject({ ok: false, error: { code: "rejected_by_user" } });
  });

  test("a second tab sees occupied and takes over; the first ends taken-over", async () => {
    const { link, port } = await relay();
    const a = tab(port);
    await until(() => a.conn.state.kind === "awaiting-approval");
    a.conn.allow();
    await until(() => a.conn.state.kind === "connected");

    const b = tab(port);
    await until(() => b.conn.state.kind === "awaiting-approval");
    expect(b.conn.state).toMatchObject({ occupied: true });
    b.conn.allow();
    await until(() => b.conn.state.kind === "connected");
    await until(() => a.conn.state.kind === "taken-over");
    expect(a.disconnected()).toBe(1);
    expect(await link.call("list_projects" as ToolName, {}, 1000)).toMatchObject({ ok: true });
  });
});
