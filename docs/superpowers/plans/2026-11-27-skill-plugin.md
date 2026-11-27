# Skill Plugin + Quick Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the signum-smartc skill as a Claude Code plugin with the Studio relay, steer the skill to the Studio's MCP tools, and make the plugin the Studio Quick Start's Claude route.

**Architecture:** The skill repo (`/home/ohager/code/signum/signum-smartc-skill`, branch `feat/claude-plugin`) becomes a plugin and its own marketplace: manifests at the root, `SKILL.md` stays where it is. The Studio (`/home/ohager/code/signum/signum-smartc-scd`, branch `feat/skill-plugin`) shows the plugin commands in the Claude tab whenever the relay needs no extra arguments.

**Tech Stack:** Skill repo: Bun + Vitest (`bun vitest run`), Claude Code plugin manifests. Studio: React 19, jotai, bun:test, i18n JSON in nine locales.

**Spec:** `docs/superpowers/specs/2026-11-27-skill-plugin-design.md`

## Global Constraints

- Plugin name `signum-smartc`, marketplace name `signum`, MCP server name `smartc-studio`, relay command `npx -y @smartc-studio/mcp` with no extra args.
- Install commands, verbatim: `claude plugin marketplace add ohager/signum-smartc-skill` and `claude plugin install signum-smartc@signum`.
- Remove-old-relay command, verbatim: `claude mcp remove smartc-studio --scope user`.
- `SKILL.md` stays at the repo root with frontmatter `name: signum-smartc`; `install.sh` and `npx skills add … -g` keep working unchanged.
- Skill release 1.1.0; plugin.json `version` always equals `VERSION`.
- Codex and "other" tabs unchanged. No Studio release, no push or tag without the user's OK.
- Commands and product names stay untranslated (`// i18n-ignore`, GLOSSARY.md); new UI strings in all nine locales.

## Review Focus

- A custom port or a non-production origin in the Claude tab must show the manual `claude mcp add … --port/--allow-origin` commands; the plugin's fixed relay would never connect there. (Task 4, Task 5 tests.)
- An invalid port while typing (`port: null`) falls back to the default, so the plugin route stays shown instead of flickering. (Task 4 test.)
- Someone who registered the relay by hand and then installs the plugin gets two relays; the remove hint must be on screen next to the plugin steps. (Task 5 test.)
- plugin.json version drifting from `VERSION` means `/plugin` never delivers updates. (Task 1 test, Task 3 bump.)
- A renamed skill would break existing `install.sh` / `npx skills` users: plugin.json `name` must equal the SKILL.md frontmatter name. (Task 1 test.)

---

### Task 1: Plugin and marketplace manifests (skill repo)

**Files:**
- Create: `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, `.mcp.json`
- Test: `tests/plugin.test.ts`

**Interfaces:**
- Produces: the plugin `signum-smartc` in marketplace `signum`, MCP server `smartc-studio`.

- [ ] **Step 1: Branch** — `git switch -c feat/claude-plugin` in the skill repo.
- [ ] **Step 2: Write the failing test** `tests/plugin.test.ts` (Vitest, same file-reading style as `tests/version.test.ts`):

```ts
describe('plugin manifests', () => {
  it('plugin.json is named like the skill', () => {
    expect(plugin.name).toBe('signum-smartc');
    expect(frontmatterName(read('SKILL.md'))).toBe(plugin.name);
  });
  it('plugin.json version is VERSION', () => expect(plugin.version).toBe(read('VERSION').trim()));
  it('the marketplace lists this repo as the plugin', () => {
    expect(market.name).toBe('signum');
    expect(market.plugins).toEqual([expect.objectContaining({ name: plugin.name, source: './' })]);
  });
  it('the plugin starts the Studio relay with defaults', () =>
    expect(mcp.mcpServers['smartc-studio']).toEqual({ command: 'npx', args: ['-y', '@smartc-studio/mcp'] }));
});
```
(`frontmatterName` = the `name:` value between the leading `---` fences.)

- [ ] **Step 3: Run** `bun vitest run tests/plugin.test.ts` — Expected: FAIL (files missing).
- [ ] **Step 4: Create the three files.** plugin.json: `name`, `version` (current `VERSION`, 1.0.0), `description` (one sentence: SmartC skill plus the SmartC Studio relay), `author: { name: "ohager" }`, `repository`, `license` (match `LICENSE`). No `skills` key (root `SKILL.md` loads as the single skill). marketplace.json: `name: "signum"`, `owner: { name: "ohager" }`, one plugin entry `{ name: "signum-smartc", source: "./", description }`. `.mcp.json`: `{ "mcpServers": { "smartc-studio": { "command": "npx", "args": ["-y", "@smartc-studio/mcp"] } } }`.
- [ ] **Step 5: Run** `bun vitest run` — Expected: all pass.
- [ ] **Step 6: Validate** `claude plugin validate .` — Expected: no errors (if it rejects the `.mcp.json` wrapper, use the shape it asks for, update the test, ledger a ruling).
- [ ] **Step 7: Load check** `claude --plugin-dir . -p "Answer only with two lines: the names of your skills containing 'smartc', and the names of MCP servers containing 'smartc'."` from a scratch dir — Expected: the skill `signum-smartc:signum-smartc` and the server `smartc-studio` (a plugin-prefixed name is fine). Does not install anything.
- [ ] **Step 8: Commit** `feat: Claude Code plugin with the SmartC Studio relay, and its own marketplace`.

### Task 2: Studio-first guidance in SKILL.md (skill repo)

**Files:**
- Modify: `SKILL.md` (new section after the intro note, before "Quick Reference Index"; pointers in the Quick Reference and "Compile Script" section)
- Test: `tests/plugin.test.ts`

- [ ] **Step 1: Failing test** in `tests/plugin.test.ts`:

```ts
it('SKILL.md sends the agent to the Studio tools when connected', () => {
  const section = sectionOf(read('SKILL.md'), '## SmartC Studio connected?');
  for (const tool of ['compile', 'lint', 'analyze_gas', 'run_tests']) expect(section).toContain(`\`${tool}\``);
  expect(section).toContain('/<project>/<file>');
  expect(section).toContain('scripts/install.sh');
});
```
(`sectionOf` = text from that heading to the next `## `.)

- [ ] **Step 2: Run** — Expected: FAIL (heading missing).
- [ ] **Step 3: Write the section**: when tools named `compile`, `lint`, `analyze_gas`, `run_tests` from the `smartc-studio` MCP server are available (under any prefix), the contracts live in the Studio workspace at `/<project>/<file>`, not on disk; use those tools, never `scripts/*.js`; loop compile → lint → analyze_gas → run_tests on their real results; deployment stays the user's (Studio deploy page). The scripts are for contracts on disk and need `scripts/install.sh`. Add one line each to the Quick Reference ("Studio connected? → § SmartC Studio connected?") and the Compile Script section.
- [ ] **Step 4: Run** `bun vitest run` — Expected: all pass.
- [ ] **Step 5: Commit** `docs(skill): prefer the SmartC Studio tools when the Studio is connected`.

### Task 3: README, Windows note, release 1.1.0 (skill repo)

**Files:**
- Modify: `README.md`, `CHANGELOG.md`, `VERSION`, `.claude-plugin/plugin.json`

- [ ] **Step 1: README.** Title/intro: works with Claude Code, Codex and other Agent-Skills agents. Installation: first "Claude Code plugin (recommended: skill + SmartC Studio relay)" with the two Global-Constraints commands and a restart; note to run `claude mcp remove smartc-studio --scope user` first if the relay was registered by hand (else two relays; one answers `another_session_connected`); updates via `/plugin`. Then "Any agent: `npx skills add ohager/signum-smartc-skill -g`", then the existing clone + `install.sh` route (needed for the local scripts). New "Windows" section: on native Windows (not WSL) npx-based MCP servers need `cmd /c`: `claude mcp add --scope user smartc-studio -- cmd /c npx -y @smartc-studio/mcp` and `codex mcp add smartc-studio -- cmd /c npx -y @smartc-studio/mcp`; if the plugin's relay does not start there, remove/disable it and use that manual route. Add the plugin files to the reference table.
- [ ] **Step 2: Bump** `VERSION` and plugin.json `version` to `1.1.0`; CHANGELOG `## [1.1.0] - 2026-11-27` with Added (plugin + marketplace, Studio section in SKILL.md, Windows note).
- [ ] **Step 3: Run** `bun vitest run` and `claude plugin validate .` — Expected: all pass, no errors.
- [ ] **Step 4: Commit** `chore(release): 1.1.0, as a Claude Code plugin with the Studio relay`. **Stop:** push, merge to `main` and tag `v1.1.0` only after the user's OK.

### Task 4: Plugin commands (Studio)

**Files:**
- Modify: `apps/studio/src/features/assistant/setup/setup-commands.ts`
- Test: `apps/studio/src/features/assistant/setup/setup-commands.test.ts`

**Interfaces:**
- Produces: `export const PLUGIN_COMMANDS: readonly [string, string]` (the two Global-Constraints commands, in order), `export const REMOVE_MANUAL_RELAY = "claude mcp remove smartc-studio --scope user"`, `export function usesPlugin(agent: AgentTab, target: SetupTarget): boolean`.

- [ ] **Step 1: Failing tests**:

```ts
it("installs the plugin from the skill repo's marketplace", () =>
  expect(PLUGIN_COMMANDS).toEqual(["claude plugin marketplace add ohager/signum-smartc-skill", "claude plugin install signum-smartc@signum"]));
it("uses the plugin for Claude Code with the default relay", () => expect(usesPlugin("claude", prod)).toBe(true));
it("keeps the plugin while the port is being typed", () => expect(usesPlugin("claude", { ...prod, port: null })).toBe(true));
it("falls back to manual commands for a custom port", () => expect(usesPlugin("claude", { ...prod, port: 6999 })).toBe(false));
it("falls back to manual commands for a dev origin", () => expect(usesPlugin("claude", { port: 6890, origin: "http://localhost:3000" })).toBe(false));
it("never for other agents", () => { expect(usesPlugin("codex", prod)).toBe(false); expect(usesPlugin("other", prod)).toBe(false); });
it("removes the hand-registered relay from user scope", () => expect(REMOVE_MANUAL_RELAY).toBe("claude mcp remove smartc-studio --scope user"));
```

- [ ] **Step 2: Run** `bun test src/features/assistant/setup` (in `apps/studio`) — Expected: FAIL (exports missing).
- [ ] **Step 3: Implement**: `usesPlugin` is true only for `"claude"` when `relayArgs(target)` adds nothing beyond `-y @smartc-studio/mcp` (the plugin's relay has fixed defaults).
- [ ] **Step 4: Run** — Expected: PASS.
- [ ] **Step 5: Commit** `feat(assistant): plugin commands for the Claude Code quick start`.

### Task 5: Claude tab shows the plugin route (Studio)

**Files:**
- Modify: `apps/studio/src/features/assistant/setup/setup-steps.tsx`, `apps/studio/src/i18n/locales/*/assistant.json` (nine), generated i18n types (`bun run i18n:types`)
- Test: `apps/studio/src/features/assistant/setup/setup-steps.test.tsx`

**Interfaces:**
- Consumes: `PLUGIN_COMMANDS`, `REMOVE_MANUAL_RELAY`, `usesPlugin` (Task 4).
- New keys under `assistant.connect.setup`: `marketplace` ("Add the SmartC marketplace"), `plugin` ("Install the plugin. It brings the relay and the SmartC skill"), `replaceManual` ("Registered the relay by hand before? Remove that entry, or two relays compete for the port:").

- [ ] **Step 1: Failing tests** (update the existing ones: the default render now shows the plugin route):

```ts
it("shows the plugin route by default", () => {
  const html = render();
  expect(html).toContain("claude plugin marketplace add ohager/signum-smartc-skill");
  expect(html).toContain("claude plugin install signum-smartc@signum");
  expect(html).not.toContain("npx skills add");
});
it("tells hand-registered users to remove the old relay", () => expect(render()).toContain("claude mcp remove smartc-studio --scope user"));
it("shows the manual commands for a custom port", () => {
  const html = render({ port: 6999, origin: target.origin });
  expect(html).toContain("claude mcp add --scope user smartc-studio -- npx -y @smartc-studio/mcp --port 6999");
  expect(html).toContain("npx skills add ohager/signum-smartc-skill -g");
});
it("keeps commands untranslated", () => { setMessages("de", de); const html = render(); expect(html).toContain("claude plugin install signum-smartc@signum"); expect(html).toContain((de.assistant as any).connect.setup.marketplace); });
```
(`render(t = target)` takes an optional target.)

- [ ] **Step 2: Run** `bun test src/features/assistant/setup` — Expected: FAIL.
- [ ] **Step 3: Implement**: in the Claude tab, when `usesPlugin`, render steps 1 `marketplace` → `PLUGIN_COMMANDS[0]`, 2 `plugin` → `PLUGIN_COMMANDS[1]`, 3 the existing `restart`, then a muted note `replaceManual` with a `Command` for `REMOVE_MANUAL_RELAY`. Otherwise today's steps. Add the three keys to all nine locales (product terms per GLOSSARY.md), run `bun run i18n:types`.
- [ ] **Step 4: Run** `bun test src/features/assistant/setup`, `bun run i18n:scan`, and the app's full `bun test` — Expected: all pass, scan clean.
- [ ] **Step 5: Commit** `feat(assistant): the Claude Code quick start installs the signum-smartc plugin`.

### Task 6: Docs (Studio)

**Files:**
- Modify: `docs/assistant.md`, `packages/studio-mcp/README.md`; commit the spec and this plan.

- [ ] **Step 1:** Both docs: Claude Code section leads with the plugin (two commands, restart, remove hint), the manual `claude mcp add` route stays for custom ports/origins; Codex unchanged; add the Windows `cmd /c` note with both commands from Task 3.
- [ ] **Step 2: Run** the Studio test suite once more (`bun test` in `apps/studio`) — Expected: pass.
- [ ] **Step 3: Commit** `docs(assistant): plugin route for Claude Code, Windows note` (with spec + plan). **Stop:** push + PR only after the user's OK, and only after the skill repo's 1.1.0 is on GitHub.
