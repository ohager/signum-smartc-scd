# AI Assistant

SmartC Studio can let a coding agent such as Claude Code or Codex work on your projects. The agent talks MCP to a small local relay, `@smartc-studio/mcp`, and the relay forwards every tool call to the Studio tab you connected. You watch what it does, can take over at any moment, and can undo any round of its work with one click.

## What the assistant can and cannot do

The assistant can read and edit project files, compile, lint, analyse gas and run tests. It writes only to the file types of a project (`.smart.c`, `.test.ts`, `.ts`, `.scenario.json`, `.labels.json`, `.inspect.json`, `.md`) and only inside your Studio workspace.

It can never touch wallets, passphrases, accounts or networks, and it cannot deploy. Those tools do not exist, so they cannot be called, however an agent is prompted. Restoring a round belongs to you, not to the agent.

The relay listens on `127.0.0.1` only. Only the Studio's own origins may connect to it; localhost origins only when the relay runs with `--dev`.

## Setup

The quickest way: open the Connect dialog in Studio (assistant icon, top right). It shows these steps for Claude Code, Codex and other agents, with the commands already filled in for your port, ready to copy.

**Claude Code:** one command installs the [signum-smartc skill](https://github.com/ohager/signum-smartc-skill) together with the relay, as a plugin:

```sh
claude plugin install signum-smartc --marketplace ohager/signum-smartc-skill
```

Restart Claude Code. `/plugin` keeps skill and relay up to date. On Claude Code older than 2.1.275, run `claude plugin marketplace add ohager/signum-smartc-skill` first, then `claude plugin install signum-smartc@signum`. A relay you registered by hand before keeps working; Claude Code skips the plugin's copy. The plugin's relay uses the default port and the hosted Studio; for anything else, use the manual steps below (the Connect dialog switches to them by itself).

**Codex, other agents, or a custom port or origin:**

1. Register the relay with your agent.

   Claude Code:

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

2. Install the signum-smartc skill. It teaches the agent the SmartC language and the testing flow, so the results are much better. One command installs it into Claude Code, Codex and the other agents it finds:

   ```sh
   npx skills add ohager/signum-smartc-skill -g
   ```

3. Restart your agent so it loads both.

**Windows:** on native Windows (not WSL), agents cannot start `npx` directly as an MCP server. Wrap it in `cmd /c`, e.g. `claude mcp add --scope user smartc-studio -- cmd /c npx -y @smartc-studio/mcp` or `codex mcp add smartc-studio -- cmd /c npx -y @smartc-studio/mcp`, and `"command": "cmd", "args": ["/c", "npx", "-y", "@smartc-studio/mcp"]` in JSON configurations. If the plugin's relay does not start on Windows, disable it in `/mcp` and register the relay this way.

Requires Node 20 or newer. Update the relay with `npx @smartc-studio/mcp@latest`.

## Connect and Allow

1. Start your agent. It starts the relay on its own.
2. In Studio, click the assistant icon at the top right and choose **Connect assistant**. The default port is `6890`. A dot on the icon shows the connection state: green when connected, pulsing while connecting, red when something needs your attention.
3. Studio shows the name of the agent that wants access. Click **Allow**.

Studio and relay now stay connected until you click **Disconnect** or close the tab.

### Port and origins

Use another port with `--port <n>` or `SMARTC_STUDIO_PORT`, and enter the same port in the Connect dialog. Ports 6876 and 6877 are reserved. If you host Studio yourself, allow its origin with `--allow-origin <origin>` (repeatable):

```toml
[mcp_servers.smartc-studio]
command = "npx"
args = ["-y", "@smartc-studio/mcp", "--allow-origin", "https://studio.example.com"]
```

### Developing Studio locally

A Studio dev server runs on `http://localhost`, and the relay refuses localhost origins by default. Any local web server can serve a page from localhost (another project's dev server, a script from a package you installed), and such a page could then connect in Studio's place and ask for your Allow. When you work on Studio itself, start the relay with `--dev` (or `SMARTC_STUDIO_DEV=1`) to accept `http://localhost` and `http://127.0.0.1` on any port:

```sh
claude mcp add --scope user smartc-studio -- npx -y @smartc-studio/mcp --dev
```

To allow just one local origin without `--dev`, name it: `--allow-origin http://localhost:3000`.

## Working with the assistant

### Rounds and the lock

A **round** starts with the assistant's first writing call in a project and ends after 60 seconds without any call that targets that project. Studio saves your open files and takes a checkpoint when a round starts.

While a round runs, the project is locked: a banner reads "AI Assistant is working on this project" and the editors are read-only. Two projects run two independent rounds, and all other projects stay free to edit.

### Take over

**Take over** in the banner ends the round at once and frees the editors. The assistant's next write is refused with a hint to re-read the files before writing again.

### Follow mode

The **Follow** switch in the banner (on by default) opens the files the assistant changes in the project you are looking at, scrolls to the first change and highlights it. If you are in another project, Studio does not pull you away; a dot in the sidebar marks the changed file instead.

### Gutter markers

After a round, the editor marks lines against the checkpoint taken at the start of the round: new lines green, changed lines blue, removed lines red. Click a marker to see the previous text. The markers stay until the next round of that project ends.

### Activity, Restore and Undo restore

Open **Activity** in the connection status to see what the assistant did, grouped by round, with the result of each call (compile, tests, lint, gas). **View changes** shows a diff for a written file.

**Restore to before this round** returns the project to its state at the start of that round. Files created later are removed and deleted files come back. Restoring an older round also discards the later assistant rounds of that project, and Studio says so; files changed since the round are listed before you confirm. Restore takes a checkpoint first, so the toast offers **Undo restore**, and the round keeps an **Undo restore** button until you restore that project again. An undo takes its own checkpoint, so it can be redone. After a restore or an undo, the assistant's next write fails with `user_took_over`, so it re-reads the files first.

The activity feed lives in memory for the session; only checkpoints persist.

## Editor diagnostics without an agent

Studio checks your `.smart.c` files in the editor even when no assistant is connected:

- **Lint** flags missing sender checks, sends without a balance check, unbounded loops, a `switch` without `default:`, missing or differing `#pragma version`, a missing `#pragma optimizationLevel`, a missing `catch` handler, faults that recur through `catch`, and deploy parameters overwritten before `main`.
- **Gas** analysis compares the worst-case cost with `activationAmount` and suggests a value that covers it.

The assistant uses the same checks through its `lint` and `analyze_gas` tools.

## Troubleshooting

**Port busy / `another_session_connected`.** Another relay (for example from a second agent session) already holds the port, so your agent's calls fail with `another_session_connected`. Close the other session, or give this one another port with `--port` and enter it in the Connect dialog. A busy relay retries every 3 seconds and takes the port by itself once the other session ends.

**Outdated relay or Studio / `protocol_mismatch`.** Relay and Studio speak different protocol versions. If Studio says the relay is outdated, run `npx @smartc-studio/mcp@latest` and restart your agent. If it asks you to reload, reload the Studio tab.

**Browser local-network permission prompt (to be confirmed).** A page on `https://` connecting to `ws://127.0.0.1` may make some browsers ask for permission to access devices on your local network. Allow it. Behaviour in Chrome, Firefox, Safari and Brave is still being checked; see `docs/superpowers/notes/ai-assistant-spike.md`.

**Studio could not reach the relay.** Check that your agent is running, that the port matches, and that Studio's origin is allowed (`--allow-origin` for self-hosted Studio).

**Another tab took over.** Only one Studio tab is connected at a time. Open the assistant menu (top right) in the tab you want, choose **Connect assistant** and confirm **Take over**.
