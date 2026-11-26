import { describe, expect, it } from "bun:test";
import { registerCommand, relayArgs } from "./setup-commands";

const prod = { port: 6890, origin: "https://smartc-studio.signum-network.dev" };

describe("setup commands", () => {
  it("registers with Claude Code", () =>
    expect(registerCommand("claude", prod)).toBe("claude mcp add smartc-studio -- npx -y @smartc-studio/mcp"));

  it("registers with Codex", () =>
    expect(registerCommand("codex", prod)).toBe("codex mcp add smartc-studio -- npx -y @smartc-studio/mcp"));

  it("gives other clients the mcpServers JSON", () =>
    expect(JSON.parse(registerCommand("other", prod))).toEqual({
      mcpServers: { "smartc-studio": { command: "npx", args: ["-y", "@smartc-studio/mcp"] } },
    }));

  it("adds a non-default port", () =>
    expect(relayArgs({ ...prod, port: 6999 })).toEqual(["-y", "@smartc-studio/mcp", "--port", "6999"]));

  it("falls back to the default port", () => expect(relayArgs({ ...prod, port: null })).toEqual(["-y", "@smartc-studio/mcp"]));

  it("allows an origin the relay would refuse, after the port", () =>
    expect(relayArgs({ port: 6999, origin: "http://localhost:3000" })).toEqual([
      "-y",
      "@smartc-studio/mcp",
      "--port",
      "6999",
      "--allow-origin",
      "http://localhost:3000",
    ]));

  it("uses the protocol's origin check", () =>
    expect(relayArgs({ port: 6890, origin: "https://self-hosted.example" })).toContain("--allow-origin"));

  it("carries the extras into every tab", () => {
    const local = { port: 6999, origin: "http://localhost:3000" };
    expect(registerCommand("claude", local)).toEndWith("--port 6999 --allow-origin http://localhost:3000");
    expect(JSON.parse(registerCommand("other", local)).mcpServers["smartc-studio"].args).toEqual(relayArgs(local));
  });
});
