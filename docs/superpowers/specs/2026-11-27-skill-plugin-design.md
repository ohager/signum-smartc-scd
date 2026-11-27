# Skill repo: Claude Code plugin, Studio-first guidance, Windows note

Short design. Two repos: `ohager/signum-smartc-skill` (the skill) and this one (the Studio Quick Start).

## Intent

People who already use Claude Code should get the SmartC skill and the Studio relay with as
little setup as possible, and keep both up to date the same way. When the Studio is connected,
the skill must steer the agent to the Studio's tools instead of local scripts that may not even
be installed (`npx skills add` never runs `install.sh`, so the compiler is missing).

## Goals

1. The skill repo is also a Claude Code plugin and its own marketplace: one install brings the
   skill and the relay, `/plugin` updates both.
2. `SKILL.md` tells the agent to prefer the `smartc-studio` MCP tools whenever they are available.
3. A Windows note for `npx`-based MCP servers.
4. The Studio Quick Start's Claude tab recommends the plugin.

## Non-goals

- No change to the Codex or "other agents" tabs, nor to `install.sh` / `npx skills add`; those
  routes keep working.
- No Codex plugin.
- No Studio release in this work; that is a separate step with its own OK.

## Approaches (the user picked A)

- **A. Plugin as the recommended Claude route.** Skill repo gains plugin + marketplace manifests,
  the Studio's Claude tab shows the plugin commands. Most comfortable; costs a small Studio change.
- B. Plugin only as an extra route in the skill README. No Studio change, but two parallel guides.
- C. No plugin; only the SKILL.md and Windows notes.

## Design

### Skill repo (release 1.1.0)

- `.claude-plugin/plugin.json`: `name: "signum-smartc"`, `version` = `VERSION`, description,
  author, repository, license. `SKILL.md` stays at the root, which Claude Code loads as the
  plugin's single skill. No `skills` key needed. Verify the plugin's skill appears as
  `signum-smartc:signum-smartc`.
- `.mcp.json` at the root: one server `smartc-studio` → `npx -y @smartc-studio/mcp`, no extra args
  (default port 6890, production origin).
- `.claude-plugin/marketplace.json`: marketplace `signum` (my call: short, reads as
  `signum-smartc@signum`), one plugin entry `signum-smartc` with `source: "./"`.
- `tests/version.test.ts`: plugin.json `version` equals `VERSION`; marketplace entry name equals
  plugin name.
- `claude plugin validate .` passes.
- `SKILL.md`: new section near the top, "SmartC Studio connected?": if tools named `compile`,
  `lint`, `analyze_gas`, `run_tests` (any prefix) from the `smartc-studio` server are available,
  the contract lives in the Studio workspace (`/<project>/<file>`), not on disk. Use those tools
  and not `scripts/*.js`, and loop compile → lint → analyze_gas → run_tests. The local scripts are
  for contracts on disk and need `scripts/install.sh`. The Quick Reference and Compile Script
  section get a one-line pointer to it.
- README: plugin install as the first Claude Code option, including "already registered the relay
  with `claude mcp add`? remove it: `claude mcp remove smartc-studio --scope user`" (otherwise two
  relays: one works, the other answers `another_session_connected`). Windows section: on native
  Windows (not WSL) register npx servers through `cmd /c`, e.g.
  `claude mcp add --scope user smartc-studio -- cmd /c npx -y @smartc-studio/mcp`, and the same
  wrapper for Codex. If the plugin's relay does not start on native Windows, use that manual route.
- CHANGELOG 1.1.0 and VERSION bump.

### Studio (Quick Start, Claude tab)

- Default target (port 6890, production origin, so `relayArgs` adds nothing): show the plugin route.
  1. `claude plugin marketplace add ohager/signum-smartc-skill`
  2. `claude plugin install signum-smartc@signum`
  3. Restart Claude Code.

  Plus one hint line about removing an earlier `claude mcp add` entry.
- Non-default target (custom port or an origin that needs `--allow-origin`, e.g. dev or preview):
  the plugin's fixed relay cannot reach it, so the tab keeps today's manual commands
  (`claude mcp add … --port/--allow-origin` + `npx skills add … -g`).
- New `setup-commands.ts` exports for the plugin commands, unit-tested; new `assistant.connect.setup.*`
  keys in all nine locales; `docs/assistant.md` and `packages/studio-mcp/README.md` updated, incl.
  the Windows note.

## Order

Skill repo first (the Studio must not point at a marketplace that does not exist yet): branch,
implement, verify the plugin with a local `claude plugin marketplace add <path>` install, then
push and tag `v1.1.0` after the user's OK. Then the Studio branch, PR for the user to merge.

## Left to the builder

Exact wording of the SKILL.md section and the hint strings. Plugin description text.
