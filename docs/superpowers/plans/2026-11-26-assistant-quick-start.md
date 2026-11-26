# Assistant Quick Start Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copyable per-agent setup steps (register relay, install skill, restart) inside the Connect dialog, with commands that match the dialog's port and the Studio's origin.

**Architecture:** A pure module builds the commands from `{ port, origin }`; a small `SetupSteps` component renders them as tabs inside `ConnectDialog`; two `atomWithStorage` atoms remember the tab and whether setup is done (set on the first `connected` state).

**Tech Stack:** React 19, jotai, Radix Tabs (`@/components/ui/tabs`), sonner, bun test, `@smartc-studio/assistant-protocol`.

**Spec:** `docs/superpowers/specs/2026-11-26-assistant-quick-start-design.md`

## Global Constraints

- Relay args always start with `-y @smartc-studio/mcp`.
- Server name in every command: `smartc-studio`.
- `--port <n>` only when port ≠ 6890; `--allow-origin <origin>` only when `isAllowedOrigin(origin)` (no extras, no localhost) is false. Order: `--port` before `--allow-origin`.
- Skill command, identical on every tab: `npx skills add ohager/signum-smartc-skill`.
- Commands are code: never translated, never passed through `t()`.
- New user-facing copy as i18n keys under `assistant.connect.setup.*` in all nine locales (`de en es fr it pt-BR ru uk zh-CN`), following `src/i18n/GLOSSARY.md`; regenerate `keys.generated.ts` with `bun run i18n:types` (in `apps/studio`).
- Storage: `atomWithStorage` only (it already tolerates unavailable storage); keys prefixed `scd:`.

## Review Focus

1. Port field empty or invalid while typing → commands use 6890, never `--port NaN`/`--port null`. (Task 1 test `falls back to the default port`.)
2. Studio on a preview origin matched by `PREVIEW_ORIGINS` → no `--allow-origin`, because the relay already accepts it. (Task 1 uses `isAllowedOrigin`; test `uses the protocol's origin check`.)
3. Clipboard refused (insecure context, permission) → error toast, no throw; the command text stays selectable (`select-all` on the code element). (Task 3, manual check step.)
4. Long commands (`--allow-origin http://localhost:3000`) in the dialog → wrap inside the code block, never widen the dialog or scroll the page horizontally (`break-all` / `whitespace-pre-wrap`). (Task 3 render test asserts the class.)
5. Locale switched to e.g. `de` → step titles translated, commands byte-identical to `en`. (Task 3 render test.)

---

### Task 1: Command builder

**Files:**
- Modify: `packages/assistant-protocol/src/origins.ts` (add `DEFAULT_RELAY_PORT`)
- Modify: `packages/studio-mcp/src/config.ts:1` (`DEFAULT_PORT = DEFAULT_RELAY_PORT`, keep the export name)
- Modify: `apps/studio/src/features/assistant/state.ts:23` (default `DEFAULT_RELAY_PORT`)
- Create: `apps/studio/src/features/assistant/setup/setup-commands.ts`
- Test: `apps/studio/src/features/assistant/setup/setup-commands.test.ts`

**Interfaces:**
- Produces:
  - `export const DEFAULT_RELAY_PORT = 6890` (protocol)
  - `export type AgentTab = "claude" | "codex" | "other"`
  - `export const AGENT_TABS: readonly AgentTab[] = ["claude", "codex", "other"]`
  - `export interface SetupTarget { port: number | null; origin: string }`
  - `export function relayArgs(target: SetupTarget): string[]`
  - `export function registerCommand(agent: AgentTab, target: SetupTarget): string`
  - `export const SKILL_COMMAND = "npx skills add ohager/signum-smartc-skill"`

- [ ] **Step 1: Write the failing tests**

```ts
const prod = { port: 6890, origin: "https://smartc-studio.signum-network.dev" };

it("registers with Claude Code", () =>
  expect(registerCommand("claude", prod)).toBe("claude mcp add smartc-studio -- npx -y @smartc-studio/mcp"));
it("registers with Codex", () =>
  expect(registerCommand("codex", prod)).toBe("codex mcp add smartc-studio -- npx -y @smartc-studio/mcp"));
it("gives other clients the mcpServers JSON", () =>
  expect(JSON.parse(registerCommand("other", prod))).toEqual({ mcpServers: { "smartc-studio": { command: "npx", args: ["-y", "@smartc-studio/mcp"] } } }));
it("adds a non-default port", () =>
  expect(relayArgs({ ...prod, port: 6999 })).toEqual(["-y", "@smartc-studio/mcp", "--port", "6999"]));
it("falls back to the default port", () =>
  expect(relayArgs({ ...prod, port: null })).toEqual(["-y", "@smartc-studio/mcp"]));
it("allows an origin the relay would refuse, after the port", () =>
  expect(relayArgs({ port: 6999, origin: "http://localhost:3000" })).toEqual(["-y", "@smartc-studio/mcp", "--port", "6999", "--allow-origin", "http://localhost:3000"]));
it("uses the protocol's origin check", () =>
  expect(relayArgs({ port: 6890, origin: "https://self-hosted.example" })).toContain("--allow-origin"));
it("carries the extras into every tab", () => {
  const local = { port: 6999, origin: "http://localhost:3000" };
  expect(registerCommand("claude", local)).toEndWith("--port 6999 --allow-origin http://localhost:3000");
  expect(JSON.parse(registerCommand("other", local)).mcpServers["smartc-studio"].args).toEqual(relayArgs(local));
});
```

- [ ] **Step 2: Run** `cd apps/studio && bun test src/features/assistant/setup` → FAIL (module not found).
- [ ] **Step 3: Implement** `setup-commands.ts`; origin check via `isAllowedOrigin(origin)` from `@smartc-studio/assistant-protocol`; JSON via `JSON.stringify(…, null, 2)`. Add `DEFAULT_RELAY_PORT` and switch the two existing literals to it.
- [ ] **Step 4: Run** `bun test src/features/assistant/setup` (apps/studio) and `bun test packages/studio-mcp` (root) → PASS.
- [ ] **Step 5: Commit** `feat(assistant): build setup commands from port and origin`.

### Task 2: Remembered tab and setup-done flag

**Files:**
- Modify: `apps/studio/src/features/assistant/state.ts`
- Modify: `apps/studio/src/features/assistant/ui/assistant-provider.tsx:72`

**Interfaces:**
- Consumes: `AgentTab` (Task 1)
- Produces:
  - `export const setupTabAtom = atomWithStorage<AgentTab>("scd:assistant-setup-tab", "claude")`
  - `export const setupDoneAtom = atomWithStorage("scd:assistant-setup-done", false)`

- [ ] **Step 1: Add both atoms** in `state.ts`.
- [ ] **Step 2: Set the flag** in the existing `runtime.connection.subscribe` callback: when `s.kind === "connected"`, `jotaiStore.set(setupDoneAtom, true)`. Comment: the first real connection proves setup worked; the dialog then starts collapsed.
- [ ] **Step 3: Run** `bun test src/features/assistant` (apps/studio) → PASS (no behaviour change for existing tests).
- [ ] **Step 4: Commit** `feat(assistant): remember setup tab and first successful connection`.

### Task 3: Setup steps in the Connect dialog, copy, docs

**Files:**
- Create: `apps/studio/src/features/assistant/setup/setup-steps.tsx`
- Test: `apps/studio/src/features/assistant/setup/setup-steps.test.tsx`
- Modify: `apps/studio/src/features/assistant/ui/connect-dialog.tsx`
- Modify: `apps/studio/src/i18n/locales/*/assistant.json` (9 files), `apps/studio/src/i18n/keys.generated.ts` (generated)
- Modify: `packages/studio-mcp/README.md`, `docs/assistant.md`, `apps/studio/src/i18n/GLOSSARY.md`

**Interfaces:**
- Consumes: `registerCommand`, `relayArgs`, `SKILL_COMMAND`, `AGENT_TABS`, `AgentTab`, `SetupTarget` (Task 1); `setupTabAtom`, `setupDoneAtom` (Task 2)
- Produces: `export function SetupSteps({ target }: { target: SetupTarget }): JSX.Element`

Tab labels `Claude Code` and `Codex` are product names: literals marked `{/* i18n-ignore — product name */}`, as elsewhere in the codebase; also add both to the glossary's "Never translated" line.

i18n keys (en copy fixed here; translate per glossary):

| key | en |
|---|---|
| `assistant.connect.setup.other` | `Other` |
| `assistant.connect.setup.register` | `Register the relay` |
| `assistant.connect.setup.registerOther` | `Add this to your agent's MCP configuration` |
| `assistant.connect.setup.skill` | `Install the SmartC skill` |
| `assistant.connect.setup.restart` | `Restart {agent} so it picks up both` |
| `assistant.connect.setup.restartOther` | `Restart your agent so it picks up both` |
| `assistant.connect.setup.show` | `Show setup` |
| `assistant.connect.setup.hide` | `Hide setup` |
| `assistant.connect.setup.copy` | `Copy` |
| `assistant.connect.setup.copied` | `Copied` |
| `assistant.connect.setup.copyFailed` | `Could not copy. Select the command and copy it yourself.` |
| `assistant.connect.hint` (replace) | `Your agent starts the relay itself once it is registered. Then connect here.` |

- [ ] **Step 1: Write the failing render tests** (`renderToStaticMarkup`, as in `components/ui/amount.test.tsx`; wrap in a jotai `Provider` with a fresh store):
  - `shows the Claude Code command by default` → markup contains `claude mcp add smartc-studio -- npx -y @smartc-studio/mcp` and `npx skills add ohager/signum-smartc-skill`.
  - `wraps long commands` → the code element's class contains `break-all`.
  - `keeps commands untranslated` → with `setMessages("de", …de assistant messages…)`, markup still contains the exact Claude command, and contains the German `register` title.
- [ ] **Step 2: Run** `bun test src/features/assistant/setup` → FAIL.
- [ ] **Step 3: Implement `SetupSteps`**: `Tabs` bound to `setupTabAtom`; per tab three numbered steps; steps 1 and 2 render a `<code className="… whitespace-pre-wrap break-all select-all font-mono text-xs">` with a ghost icon button (`CopyIcon`, `aria-label` = copy key) calling `navigator.clipboard.writeText` → `toast.success(copied)`, on rejection or missing API `toast.error(copyFailed)`. The whole block sits in a collapsible bound to `setupDoneAtom` (collapsed when true; toggle button Show/Hide setup only flips local state, it never resets the flag).
- [ ] **Step 4: Wire into `ConnectDialog`**: `DialogContent` → `sm:max-w-xl`; render `<SetupSteps target={{ port, origin: location.origin }} />` between the description and the port field (`port` is the live `parsePort(raw)`, may be null); replace the hint text with the new `assistant.connect.hint`.
- [ ] **Step 5: Add keys to all nine `assistant.json`**, run `bun run i18n:types`, `bun run i18n:scan` → `clean`.
- [ ] **Step 6: Docs**: in `packages/studio-mcp/README.md` and `docs/assistant.md` use `npx -y @smartc-studio/mcp`, show `codex mcp add smartc-studio -- npx -y @smartc-studio/mcp` next to the TOML, and add the skill step `npx skills add ohager/signum-smartc-skill` (works for Claude Code, Codex and other agents). Mention that the Connect dialog shows the same commands, filled in for your port.
- [ ] **Step 7: Run** `bun test` (repo root) → 0 fail; `bun run build` → success.
- [ ] **Step 8: Manual check** on `localhost:3000`: dialog shows `--allow-origin http://localhost:3000`; typing port `7000` updates all tabs; Copy works; with clipboard blocked (DevTools → deny permission) an error toast appears and the text is selectable; after a real connection, reopening the dialog shows it collapsed.
- [ ] **Step 9: Commit** `feat(assistant): quick start in the connect dialog` (include docs).
