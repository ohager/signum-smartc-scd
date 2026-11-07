import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { parseConfig, type RelayConfig } from "./config";
import { createMcpServer } from "./mcp-server";
import { TabLink } from "./tab-link";

/** stdout belongs to the MCP protocol; everything human-readable goes to stderr. */
const log = (msg: string) => process.stderr.write(`[smartc-studio-mcp] ${msg}\n`);

export async function startRelay(config: RelayConfig): Promise<void> {
  const link = new TabLink({ port: config.port, allowOrigins: config.allowOrigins });
  const server = createMcpServer(link);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    await link.stop().catch(() => {});
    await server.close().catch(() => {});
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  process.stdin.on("end", shutdown);
  process.stdin.on("close", shutdown);

  const state = await link.start();
  if (state === "busy") log(`Port ${config.port} is already in use, probably by another relay. Tool calls will report another_session_connected.`);
  else log(`Waiting for SmartC Studio on ws://127.0.0.1:${config.port}`);

  await server.connect(new StdioServerTransport());
}

if (import.meta.main !== false) {
  let config: RelayConfig;
  try {
    config = parseConfig(process.argv.slice(2), process.env);
  } catch (e) {
    log(e instanceof Error ? e.message : String(e));
    process.exit(2);
  }
  startRelay(config).catch((e) => {
    log(`Fatal: ${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  });
}
