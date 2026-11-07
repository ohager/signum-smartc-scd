import { afterEach, expect, test } from "bun:test";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import WebSocket from "ws";
import { METHODS } from "@smartc-studio/assistant-protocol";

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

const cli = fileURLToPath(new URL("./cli.ts", import.meta.url));

test("round-trips a tool call from the MCP client to the fake tab", async () => {
  const port = await freePort();
  const transport = new StdioClientTransport({ command: "bun", args: [cli, "--port", String(port)], stderr: "pipe" });
  const client = new Client({ name: "it", version: "0" });
  cleanup.push(() => client.close());
  await client.connect(transport);

  let ws!: WebSocket;
  for (let i = 0; ; i++) {
    try {
      ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: "http://localhost:3000" } });
      await new Promise<void>((res, rej) => {
        ws.once("open", () => res());
        ws.once("error", rej);
      });
      break;
    } catch (e) {
      if (i > 50) throw e;
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  cleanup.push(() => ws.close());
  ws.on("message", (raw) => {
    const msg = JSON.parse(String(raw));
    if (msg.method === METHODS.call) {
      ws.send(JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { ok: true, data: { projects: [{ name: "demo" }], tool: msg.params.tool } } }));
    }
  });
  const rpc = (id: number, method: string, params: unknown) => ws.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
  rpc(1, METHODS.hello, { supported: [1], catalogHash: "x", studioVersion: "test" });
  await new Promise((r) => setTimeout(r, 200));
  rpc(2, METHODS.accept, { takeover: false });
  await new Promise((r) => setTimeout(r, 200));

  const res: any = await client.callTool({ name: "list_projects", arguments: {} });
  expect(res.isError).toBeFalsy();
  expect(JSON.parse(res.content[0].text)).toEqual({ projects: [{ name: "demo" }], tool: "list_projects" });
}, 20_000);

test("exits non-zero naming a reserved port", async () => {
  const proc = Bun.spawn(["bun", cli, "--port", "6876"], { stdout: "pipe", stderr: "pipe" });
  const code = await proc.exited;
  expect(code).not.toBe(0);
  expect(await new Response(proc.stderr).text()).toContain("6876");
  expect(await new Response(proc.stdout).text()).toBe("");
});
