# @smartc-studio/mcp

MCP relay between a coding agent (Claude Code, Codex, ...) and [SmartC Studio](https://github.com/ohager/signum-smartc-scd) running in your browser. The agent speaks MCP over stdio; the relay forwards every tool call to the Studio tab you connected. Requires Node 20 or newer.

The agent can read and edit project files, compile, lint, analyse gas and run tests. It cannot deploy, and it has no access to wallets, accounts, passphrases or networks.

## Setup

The Connect dialog in SmartC Studio (assistant icon, top right) shows these steps with the commands filled in for your port.

Claude Code, simplest: the [signum-smartc plugin](https://github.com/ohager/signum-smartc-skill) brings this relay (default port and origin) together with the SmartC skill, and `/plugin` updates both:

```sh
claude plugin install signum-smartc --marketplace ohager/signum-smartc-skill
```

Claude Code, by hand (also for a custom port or origin):

```sh
claude mcp add --scope user smartc-studio -- npx -y @smartc-studio/mcp
```

Codex:

```sh
codex mcp add smartc-studio -- npx -y @smartc-studio/mcp
```

Other MCP clients:

```json
{ "mcpServers": { "smartc-studio": { "command": "npx", "args": ["-y", "@smartc-studio/mcp"] } } }
```

Install the [signum-smartc skill](https://github.com/ohager/signum-smartc-skill) too (Claude Code, Codex and other agents):

```sh
npx skills add ohager/signum-smartc-skill -g
```

On native Windows (not WSL), wrap `npx` in `cmd /c`: `claude mcp add --scope user smartc-studio -- cmd /c npx -y @smartc-studio/mcp`, `codex mcp add smartc-studio -- cmd /c npx -y @smartc-studio/mcp`, or `"command": "cmd", "args": ["/c", "npx", "-y", "@smartc-studio/mcp"]` in JSON.

Restart your agent, then open SmartC Studio, click the assistant icon (top right) and choose **Connect assistant**. Update with `npx @smartc-studio/mcp@latest`.

## Options

| Option | Environment | Default | |
|---|---|---|---|
| `--port <n>` | `SMARTC_STUDIO_PORT` | `6890` | Local WebSocket port the Studio connects to. Ports 6876 and 6877 are reserved. |
| `--allow-origin <origin>` | | | Additional browser origin allowed to connect (repeatable), e.g. a self-hosted Studio or one local dev server like `http://localhost:3000`. |
| `--dev` | `SMARTC_STUDIO_DEV=1` | off | Also accept `http://localhost` and `http://127.0.0.1` origins on any port, for developing Studio locally. |

Localhost origins are refused unless you pass `--dev` or name one with `--allow-origin`: any local web server can serve a page from localhost, and without this gate such a page could connect in the Studio's place and ask for your Allow.

The relay listens on `127.0.0.1` only and accepts a single Studio session at a time.

## License

Apache-2.0
