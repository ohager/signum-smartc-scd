# Assistant Quick Start in the Connect dialog — design

Date: 2026-11-26 · Size: small change · Branch: `feat/ai-assistant`

## Intent

People who already use Claude Code or Codex should get from "I have an agent" to
"connected, with the SmartC skill" without leaving Studio or reading docs. The
current hint ("Start the relay with `npx @smartc-studio/mcp`") is also wrong in
spirit: the agent starts the relay, the user only registers it once.

## Goals

- Copyable setup steps per agent inside the Connect dialog.
- Commands always match what the dialog will connect to (port, origin).
- Skill installation is part of the steps, not a footnote.

## Non-goals

- Explaining what a coding agent is or how to install one (audience already uses one).
- A Claude Code plugin bundling relay + skill (belongs in the skill repo; follow-up).
- Changing the skill itself (follow-up: tell it to prefer the smartc-studio MCP
  tools over its own `scripts/compile.js` / `gas-analysis.js` when they exist).

## Anti-goals

- Commands that silently don't work for the Studio the user is on (wrong port,
  localhost origin refused by the relay).
- A setup block that nags people who are already set up.

## Approaches

- **A — in the Connect dialog (picked).** Tabs above the port field; the steps
  read the port the user is typing. Setup and connect happen in one place and
  can't disagree about the port.
- B — separate "Set up assistant" dialog from the bot menu. Keeps Connect slim,
  but splits one flow across two dialogs that must agree on the port.
- Docs page only — rejected: the request is for guidance *in* Studio.

## Design

Connect dialog, widened (~`sm:max-w-xl`):

```
┌ Connect assistant ─────────────────────────┐
│ description                                │
│ [Claude Code] [Codex] [Other]              │
│ 1  Register the relay                  ⧉   │
│    claude mcp add smartc-studio -- npx -y …│
│ 2  Install the SmartC skill            ⧉   │
│ 3  Restart Claude Code                     │
│ ───────────────────────────────────────── │
│ Port [6890]                    [Connect]   │
└────────────────────────────────────────────┘
```

Commands (relay args = `-y @smartc-studio/mcp` plus extras below):

| Tab | Step 1 |
|---|---|
| Claude Code | `claude mcp add smartc-studio -- npx <args>` |
| Codex | `codex mcp add smartc-studio -- npx <args>` |
| Other | JSON for MCP clients: `{"mcpServers":{"smartc-studio":{"command":"npx","args":[…]}}}` |

Extras appended to the relay args, computed from the dialog state:
- port ≠ 6890 → `--port <n>`
- `location.origin` not in `STUDIO_ORIGINS` → `--allow-origin <origin>`
  (self-hosted or local dev Studio; without it the relay refuses the tab)

Step 2 (skill): `npx skills add ohager/signum-smartc-skill` for every tab
(verified by the user: the skills CLI recognises the repo and installs into the
detected agents).

Step 3: restart the agent (agents read MCP config and skills at start).

Behaviour:
- Copy button per command → clipboard + short toast.
- Selected tab remembered (localStorage, try/catch, per-viewer convenience).
- After the first successful connection the setup block starts collapsed
  ("Show setup"); remembered the same way.
- Commands are code and never translated; step titles and hints are i18n keys
  in all nine locales.
- `assistant.connect.hint` replaced (no more "start the relay").

Also: `-y` and the skill step in `packages/studio-mcp/README.md` and
`docs/assistant.md`.

## Left to the builder

Component split, exact copy, where the command-building function lives
(pure function with unit tests: port/origin cases, per-tab output).
