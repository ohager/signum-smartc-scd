import { DEFAULT_RELAY_PORT, isAllowedOrigin } from "@smartc-studio/assistant-protocol";

export type AgentTab = "claude" | "codex" | "other";

export const AGENT_TABS: readonly AgentTab[] = ["claude", "codex", "other"];

/** What the dialog will connect to: the port being typed (null while invalid) and this tab's origin. */
export interface SetupTarget {
  port: number | null;
  origin: string;
}

const SERVER_NAME = "smartc-studio";
const RELAY_PACKAGE = ["-y", "@smartc-studio/mcp"] as const;

/* -g: global, like the relay's user scope; the default installs into the current folder only. */
export const SKILL_COMMAND = "npx skills add ohager/signum-smartc-skill -g";

/*
 * The relay's command line, matching this Studio: a port other than the default must be
 * passed, and an origin the relay would refuse by default (self-hosted, local dev) must be
 * allowed, or the commands look right and the connection silently fails.
 */
export function relayArgs({ port, origin }: SetupTarget): string[] {
  const args: string[] = [...RELAY_PACKAGE];
  if (port !== null && port !== DEFAULT_RELAY_PORT) args.push("--port", String(port));
  if (!isAllowedOrigin(origin)) args.push("--allow-origin", origin);
  return args;
}

/*
 * Claude Code plugin from the skill repo: the skill plus a relay with default arguments, and
 * --marketplace adds the repo's marketplace on the way. One command, updated through /plugin.
 */
export const PLUGIN_COMMAND = "claude plugin install signum-smartc --marketplace ohager/signum-smartc-skill";

/* The plugin's relay has fixed defaults; a custom port or origin needs the manual registration. */
export function usesPlugin(agent: AgentTab, target: SetupTarget): boolean {
  return agent === "claude" && relayArgs(target).length === RELAY_PACKAGE.length;
}

export function registerCommand(agent: AgentTab, target: SetupTarget): string {
  const args = relayArgs(target);
  switch (agent) {
    case "claude":
      // User scope: Claude Code's default (local) would register the relay for whatever folder the terminal is in.
      return `claude mcp add --scope user ${SERVER_NAME} -- npx ${args.join(" ")}`;
    case "codex":
      return `codex mcp add ${SERVER_NAME} -- npx ${args.join(" ")}`;
    case "other":
      return JSON.stringify({ mcpServers: { [SERVER_NAME]: { command: "npx", args } } }, null, 2);
  }
}
