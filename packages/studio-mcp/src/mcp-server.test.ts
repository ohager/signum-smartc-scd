import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { ToolOutcome } from "@smartc-studio/assistant-protocol";
import { INSTRUCTIONS } from "./instructions";
import { createMcpServer } from "./mcp-server";

const cleanup: Array<() => Promise<void>> = [];
afterEach(async () => {
  while (cleanup.length) await cleanup.pop()!();
});

async function setup(outcome: ToolOutcome = { ok: true, data: { projects: [] } }) {
  const calls: unknown[][] = [];
  const clients: unknown[] = [];
  const link = {
    async call(...args: unknown[]) {
      calls.push(args);
      return outcome;
    },
    setClient(c: unknown) {
      clients.push(c);
    },
  };
  const server = createMcpServer(link as never);
  const [a, b] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test-agent", version: "1.2.3" });
  await Promise.all([server.connect(a), client.connect(b)]);
  cleanup.push(async () => {
    await client.close();
    await server.close();
  });
  return { client, calls, clients };
}

const text = (res: any) => res.content[0].text as string;

describe("mcp server", () => {
  test("lists all catalog tools with JSON schemas", async () => {
    const { client } = await setup();
    const { tools } = await client.listTools();
    expect(tools).toHaveLength(13);
    const read = tools.find((t) => t.name === "read_file")!;
    expect(read.inputSchema.type).toBe("object");
    expect(read.inputSchema.required).toEqual(["path"]);
    expect((read.inputSchema as any).$schema).toBeUndefined();
  });

  test("passes the client info to the link", async () => {
    const { clients } = await setup();
    await new Promise((r) => setTimeout(r, 20));
    expect(clients).toEqual([{ name: "test-agent", version: "1.2.3" }]);
  });

  test("validates before forwarding", async () => {
    const { client, calls } = await setup();
    const res: any = await client.callTool({ name: "read_file", arguments: { path: "relative" } });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).code).toBe("internal");
    expect(JSON.parse(text(res)).hint).toBe("Fix the arguments and call again.");
    expect(calls).toHaveLength(0);
  });

  test("unknown tool is a protocol_mismatch", async () => {
    const { client } = await setup();
    const res: any = await client.callTool({ name: "deploy", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res)).code).toBe("protocol_mismatch");
  });

  test("forwards and wraps results", async () => {
    const { client, calls } = await setup({ ok: true, data: { a: 1 } });
    const res: any = await client.callTool({ name: "list_files", arguments: { project: "p" } });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({ a: 1 });
    expect(calls[0]).toEqual(["list_files", { project: "p" }, 10_000]);
  });

  test("wraps tool errors", async () => {
    const { client } = await setup({ ok: false, error: { code: "file_not_found", message: "no", hint: "list" } });
    const res: any = await client.callTool({ name: "list_projects", arguments: {} });
    expect(res.isError).toBe(true);
    expect(JSON.parse(text(res))).toEqual({ code: "file_not_found", message: "no", hint: "list" });
  });

  test("lists the three prompts", async () => {
    const { client } = await setup();
    const { prompts } = await client.listPrompts();
    expect(prompts.map((p) => p.name).sort()).toEqual(["new-contract", "security-review", "write-tests"]);
    expect(prompts.find((p) => p.name === "write-tests")!.arguments).toEqual([
      { name: "project", description: expect.any(String), required: true },
    ]);
  });

  test("renders write-tests with the project", async () => {
    const { client } = await setup();
    const res = await client.getPrompt({ name: "write-tests", arguments: { project: "my-token" } });
    const t = (res.messages[0]!.content as any).text as string;
    expect(t).toContain("/my-token");
    expect(res.messages[0]!.role).toBe("user");
  });

  test("rejects a missing required prompt argument", async () => {
    const { client } = await setup();
    await expect(client.getPrompt({ name: "write-tests", arguments: {} })).rejects.toThrow();
  });

  test("serves the instructions", async () => {
    const { client } = await setup();
    expect(client.getInstructions()).toBe(INSTRUCTIONS);
  });
});

describe("instructions", () => {
  test("mention the skill and the update command", () => {
    expect(INSTRUCTIONS).toContain("signum-smartc-skill");
    expect(INSTRUCTIONS).toContain("npx @smartc-studio/mcp");
    expect(INSTRUCTIONS).toContain("user_took_over");
    /* R1 has no per-change rejection; only the connection can be rejected. */
    expect(INSTRUCTIONS).not.toContain("rejects a change");
    expect(INSTRUCTIONS.split("\n").length).toBeLessThanOrEqual(65);
  });
});
