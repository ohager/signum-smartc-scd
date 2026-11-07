# @smartc-studio/mcp

MCP relay between a coding agent (Claude Code, Codex, ...) and [SmartC Studio](https://github.com/ohager/signum-smartc-scd) running in your browser. The agent speaks MCP over stdio; the relay forwards every tool call to the Studio tab you connected. Requires Node 20 or newer.

The agent can read and edit project files, compile, lint, analyse gas and run tests. It cannot deploy, and it has no access to wallets, accounts, passphrases or networks.

## Setup

Claude Code:

```sh
claude mcp add smartc-studio -- npx @smartc-studio/mcp
```

Codex (`~/.codex/config.toml`):

```toml
[mcp_servers.smartc-studio]
command = "npx"
args = ["@smartc-studio/mcp"]
```

Then open SmartC Studio and click **Connect assistant**. Update with `npx @smartc-studio/mcp@latest`.

## Options

| Option | Environment | Default | |
|---|---|---|---|
| `--port <n>` | `SMARTC_STUDIO_PORT` | `6890` | Local WebSocket port the Studio connects to. Ports 6876 and 6877 are reserved. |
| `--allow-origin <origin>` | | | Additional browser origin allowed to connect (repeatable), e.g. a self-hosted Studio. Localhost origins are always allowed. |

The relay listens on `127.0.0.1` only and accepts a single Studio session at a time.

## Recommended

Install the [signum-smartc skill](https://github.com/ohager/signum-smartc-skill) for SmartC language knowledge.

## License

Apache-2.0
