import { DEFAULT_RELAY_PORT, isAllowedOrigin } from "@smartc-studio/assistant-protocol";

export type AgentTab = "claude" | "codex" | "other";

export const AGENT_TABS: readonly AgentTab[] = ["claude", "codex", "other"];

/** What the dialog will connect to: the port being typed (null while invalid) and this tab's origin. */
export interface SetupTarget {
  port: number | null;
  origin: string;
}

const SERVER_NAME = "smartc-studio";

export const SKILL_COMMAND = "npx skills add ohager/signum-smartc-skill";

/*
 * The relay's command line, matching this Studio: a port other than the default must be
 * passed, and an origin the relay would refuse by default (self-hosted, local dev) must be
 * allowed, or the commands look right and the connection silently fails.
 */
export function relayArgs({ port, origin }: SetupTarget): string[] {
  const args = ["-y", "@smartc-studio/mcp"];
  if (port !== null && port !== DEFAULT_RELAY_PORT) args.push("--port", String(port));
  if (!isAllowedOrigin(origin)) args.push("--allow-origin", origin);
  return args;
}

export function registerCommand(agent: AgentTab, target: SetupTarget): string {
  const args = relayArgs(target);
  switch (agent) {
    case "claude":
      return `claude mcp add ${SERVER_NAME} -- npx ${args.join(" ")}`;
    case "codex":
      return `codex mcp add ${SERVER_NAME} -- npx ${args.join(" ")}`;
    case "other":
      return JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: "npx", args } } }, null, 2);
  }
}
