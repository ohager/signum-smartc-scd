import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { CallToolRequestSchema, GetPromptRequestSchema, ListPromptsRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { CATALOG, DEFAULT_HINTS, toolDef, type AssistantError, type ClientInfo } from "@smartc-studio/assistant-protocol";
import { z } from "zod";
import { INSTRUCTIONS } from "./instructions";
import { PROMPTS } from "./prompts";
import type { TabLink } from "./tab-link";

function errorResult(error: AssistantError) {
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify(error) }] };
}

function inputSchema(input: z.ZodObject) {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(input) as Record<string, unknown>;
  return schema as { type: "object"; [k: string]: unknown };
}

export function createMcpServer(link: Pick<TabLink, "call" | "setClient">): Server {
  const server = new Server(
    { name: "smartc-studio", version: "0.0.0" },
    { capabilities: { tools: {}, prompts: {} }, instructions: INSTRUCTIONS },
  );

  server.oninitialized = () => {
    const client = server.getClientVersion();
    if (client) link.setClient(client as ClientInfo);
  };

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: CATALOG.map((def) => ({ name: def.name, description: def.description, inputSchema: inputSchema(def.input) })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = toolDef(req.params.name);
    if (!def) {
      return errorResult({ code: "protocol_mismatch", message: `Unknown tool "${req.params.name}".`, hint: DEFAULT_HINTS.protocol_mismatch });
    }
    const parsed = def.input.safeParse(req.params.arguments ?? {});
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join(".") || "(args)"}: ${i.message}`).join("\n");
      return errorResult({ code: "internal", message, hint: "Fix the arguments and call again." });
    }
    const outcome = await link.call(def.name, parsed.data, def.timeoutMs);
    if (!outcome.ok) return errorResult(outcome.error);
    return { content: [{ type: "text" as const, text: JSON.stringify(outcome.data, null, 2) }] };
  });

  server.setRequestHandler(ListPromptsRequestSchema, async () => ({
    prompts: PROMPTS.map(({ name, description, arguments: args }) => ({ name, description, arguments: args })),
  }));

  server.setRequestHandler(GetPromptRequestSchema, async (req) => {
    const prompt = PROMPTS.find((p) => p.name === req.params.name);
    if (!prompt) throw new Error(`Unknown prompt "${req.params.name}".`);
    const args = req.params.arguments ?? {};
    for (const a of prompt.arguments) {
      if (a.required && !args[a.name]) throw new Error(`Missing required argument "${a.name}".`);
    }
    return { description: prompt.description, messages: [{ role: "user" as const, content: { type: "text" as const, text: prompt.render(args) } }] };
  });

  return server;
}
