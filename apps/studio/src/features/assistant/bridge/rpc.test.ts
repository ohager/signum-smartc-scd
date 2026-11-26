import { describe, expect, test } from "bun:test";
import { createRpc } from "./rpc";
import type { SocketLike } from "./rpc";

function fakeSocket() {
  const sent: any[] = [];
  const socket: SocketLike = {
    send: (d) => void sent.push(JSON.parse(d)),
    close: () => {},
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null,
  };
  const receive = (m: unknown) => socket.onmessage?.({ data: typeof m === "string" ? m : JSON.stringify(m) });
  return { socket, sent, receive };
}
const noop = { onRequest: async () => null, onNotification: () => {} };

describe("createRpc", () => {
  test("matches responses by id with incrementing integer ids", async () => {
    const { socket, sent, receive } = fakeSocket();
    const rpc = createRpc(socket, noop);
    const a = rpc.request("a", { x: 1 });
    const b = rpc.request("b", {});
    expect(sent.map((m) => m.id)).toEqual([1, 2]);
    receive({ jsonrpc: "2.0", id: 2, result: "B" });
    receive({ jsonrpc: "2.0", id: 1, result: "A" });
    expect(await a).toBe("A");
    expect(await b).toBe("B");
  });

  test("rejects on an error response with code and data", async () => {
    const { socket, receive } = fakeSocket();
    const rpc = createRpc(socket, noop);
    const p = rpc.request("a", {});
    receive({ jsonrpc: "2.0", id: 1, error: { code: -32001, message: "nope", data: { relayVersion: 2 } } });
    const err: any = await p.catch((e) => e);
    expect(err.message).toBe("nope");
    expect(err.code).toBe(-32001);
    expect(err.data).toEqual({ relayVersion: 2 });
  });

  test("ignores unknown ids and malformed frames", async () => {
    const { socket, receive } = fakeSocket();
    createRpc(socket, noop);
    expect(() => {
      receive({ jsonrpc: "2.0", id: 99, result: 1 });
      receive("not json");
      receive("[1,2]");
      receive("null");
      receive({ foo: 1 });
    }).not.toThrow();
  });

  test("dispose rejects pending requests with the reason", async () => {
    const { socket } = fakeSocket();
    const rpc = createRpc(socket, noop);
    const p = rpc.request("a", {});
    rpc.dispose("gone");
    expect(((await p.catch((e) => e)) as Error).message).toBe("gone");
  });

  test("answers incoming requests and reports handler failures as errors", async () => {
    const { socket, sent, receive } = fakeSocket();
    createRpc(socket, {
      onRequest: async (m) => {
        if (m === "boom") throw new Error("bad");
        return { echoed: m };
      },
      onNotification: () => {},
    });
    receive({ jsonrpc: "2.0", id: "r1", method: "ping", params: {} });
    receive({ jsonrpc: "2.0", id: 7, method: "boom" });
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toContainEqual({ jsonrpc: "2.0", id: "r1", result: { echoed: "ping" } });
    expect(sent.find((m) => m.id === 7).error.message).toBe("bad");
  });

  test("routes notifications", () => {
    const { socket, receive } = fakeSocket();
    const seen: any[] = [];
    createRpc(socket, { onRequest: async () => null, onNotification: (m, p) => seen.push([m, p]) });
    receive({ jsonrpc: "2.0", method: "n", params: { a: 1 } });
    expect(seen).toEqual([["n", { a: 1 }]]);
  });

  test("a send that throws rejects the request instead of throwing", async () => {
    const { socket } = fakeSocket();
    socket.send = () => {
      throw new Error("closed");
    };
    const rpc = createRpc(socket, noop);
    expect(((await rpc.request("a", {}).catch((e) => e)) as Error).message).toBe("closed");
  });
});
