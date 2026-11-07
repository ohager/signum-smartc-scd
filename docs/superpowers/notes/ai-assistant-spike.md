# AI Assistant: spike notes and acceptance

## Open spike items (check with the user)

Deferred from the spike (spec section 11); still open.

1. **Browser reachability.** Can Chrome, Firefox, Safari and Brave reach `ws://127.0.0.1:6890` from the production origin `https://smartc-studio.signum-network.dev` and from a Vercel preview? Does a local-network permission prompt appear, and is the wording stable enough to document? If a browser blocks it, the relay needs to serve `wss://localhost` with a generated certificate.
2. **MCP prompts and instructions.** Do Claude Code and Codex show MCP prompts as slash commands and honour the server `instructions`? If one does not, the recipes move into the instructions text.
3. **Vercel preview URL pattern.** The Studio project's preview URL pattern is unknown, so `PREVIEW_ORIGINS` in `packages/assistant-protocol/src/origins.ts` is empty. Previews are rejected by the relay until it is filled (or `--allow-origin` is used).

## Controller smoke tests already run

Both ran against a real relay, the dev server and Chrome (chrome-devtools MCP).

**After Task 16 (connection and tools).**

- Connect dialog, approval showing the MCP clientInfo name, Allow.
- Via an MCP client: `list_projects`, `create_project`, `read_file`, `compile` (verdict recorded), `lint`, `analyze_gas` (worker), ambiguous `edit_file`, `write_file`, `run_tests` (real worker plus Monaco transpile, 1 pass, verdict recorded).
- `path_not_allowed` for `..` and `.asm`; editor stub returned an internal error as specified.
- Known, pre-existing console error: nested `<button>` in the left sidebar's `SidebarGroupLabel` (New project dialog trigger), not from this branch.

**After Task 19 (rounds, follow, restore).**

- Sidebar dot when outside the project; lock banner with Follow switch and Take over.
- Editor `readOnly` true during a round and false after the idle end (60 s) and after Take over.
- Gutter "changed" markers and lint markers.
- Activity panel with 2 rounds, newest first; View changes diff.
- Restore lists the files and restores (`notes.md` removed, contract line 3 back); toast with Undo restore.

## Acceptance

Run with real Claude Code and real Codex against `bun run dev` (spec sections 10 and 12). Each takes an empty project to a token contract with green tests, no lint errors and `activationAmount` above the gas maximum, without the user touching code.

| Check                                        | Claude Code | Codex |
| -------------------------------------------- | ----------- | ----- |
| Empty project to token contract, green tests |             |       |
| No lint errors                               |             |       |
| `activationAmount` above the gas maximum     |             |       |
| One-click restore of a round                 |             |       |
| Take over during a round                     |             |       |
| Disconnect during `run_tests`                |             |       |

Notes:
