# AI Assistant (R1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user connect their own CLI coding agent (Claude Code, Codex, …) to the open Studio tab through a local MCP relay, so the agent can read and write the workspace, compile, lint, analyse gas and run tests — with rounds, locks, checkpoints and an activity feed that keep the user in control.

**Architecture:** A shared protocol package (tool catalog, zod schemas, error codes, origin allowlist, wire messages) is imported by a thin Node relay (`@smartc-studio/mcp`: MCP over stdio ↔ WebSocket on `127.0.0.1`) and by a new Studio feature `features/assistant/`, where every tool executes as a thin adapter over existing modules (`FileSystem`, compiler, `runTests`, `ProjectStatus`). Gas analysis and lint are new Studio features (`features/analysis/`) that work in the editor with or without an agent. Round bookkeeping (lock, checkpoint, idle end) is a pure state machine with injected clock and hooks.

**Tech Stack:** Bun 1.3 (tests, build), React 19, jotai, Monaco (`@monaco-editor/react`), Zod 4 (`z.toJSONSchema`), `idb`, `smartc-signum-compiler@2.3.0`; relay on Node ≥ 20 with `@modelcontextprotocol/sdk` (low-level `Server`) and `ws`, bundled by `bun build --target node`.

**Spec:** `docs/superpowers/specs/2026-11-06-ai-assistant-design.md`

## Global Constraints

- Paths are relative to the repo root unless they start with `src/` (then relative to `apps/studio/`).
- Tests: `bun test <path>` from the package directory (`apps/studio/`, `packages/assistant-protocol/`, `packages/studio-mcp/`). Test files import from `"bun:test"`.
- **Typecheck** touched paths only (the repo is not type-clean as a whole, as in earlier plans): `cd apps/studio && bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "features/(assistant|analysis|testbed|deployment)|components/ui/(editor|layout)" || echo clean` — expected `clean`. Packages: `cd packages/<pkg> && bunx tsc --noEmit -p tsconfig.json` — expected no output.
- Studio and relay are **Apache-2.0**. Nothing from the skill repo except `lib/gas/analyzer.js` and its tests (the author's own work, relicensed) may be copied into this repo. MCP `instructions` recommend the skill (`https://github.com/ohager/signum-smartc-skill`) and copy none of its text.
- R1 registers **no** tool for wallets, passphrases, accounts, networks or deployment. No code in `features/assistant/` imports from `@signumjs/*`, `lib/wallet.ts`, `hooks/use-wallet-status.ts` or `features/deployment/deploy-request.ts` (Task 14 adds a test that enforces this).
- Relay port: default **6890**, `--port <n>` or `SMARTC_STUDIO_PORT`; **6876 and 6877 are refused** (the node's ports). Bind to `127.0.0.1` only.
- Writable file types (exact list): `.smart.c`, `.test.ts`, `.ts`, `.scenario.json`, `.labels.json`, `.inspect.json`, `.md`.
- Error codes (exact list, nothing else): `studio_not_connected`, `studio_disconnected`, `another_session_connected`, `rejected_by_user`, `user_took_over`, `path_not_allowed`, `file_not_found`, `edit_no_match`, `edit_ambiguous`, `timeout`, `protocol_mismatch`, `internal`. Every error carries `{code, message, hint}`; the hint names a next step.
- Timeouts: `compile` 30 s, `run_tests` 120 s (worker terminated on timeout).
- Round idle end: **60 000 ms** without an agent tool call targeting the project. Checkpoints kept: **last 20 per project**.
- Tool results are English. All Studio UI strings go through `t()` from `@/i18n/runtime`; new English keys live in a new namespace file `src/i18n/locales/en/assistant.json` (registered in `src/i18n/locales/en/index.ts`), lint/gas diagnostics in `smartc-editor.json` under `"analysis"`. Run `bun run i18n:types` after changing keys. Code terms get `// i18n-ignore`. Other locales are filled in Task 20, following `src/i18n/GLOSSARY.md`.
- Match surrounding code: block comments explain *why*, named exports, `@/` imports in the Studio, collaborators injected so logic tests without a browser.
- Commit after every task with a conventional message ending in
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`

## Decisions taken while planning

1. **Wire protocol** (JSON-RPC 2.0 over one WebSocket):
   - tab → relay request `session.hello` `{supported: number[], catalogHash: string, studioVersion: string}` → result `{protocolVersion, catalogHash, client: {name, version} | null, occupied: boolean}`, or JSON-RPC error `-32001` with `data: {relayVersion: number}` on mismatch.
   - tab → relay request `session.accept` `{takeover: boolean}` → `{ok: true}`; notification `session.deny`.
   - relay → tab request `tool.call` `{tool, args}` → result `ToolOutcome = {ok: true, data} | {ok: false, error: {code, message, hint}}`. Tool failures are never JSON-RPC errors.
   - relay → tab notifications `session.client` `{client}` (MCP client initialised after the tab connected) and `session.takenOver` (then close code 4001).
2. **Protocol version** `PROTOCOL_VERSION = 1`; Studio sends `SUPPORTED_PROTOCOL_VERSIONS = [1]` (later `[n, n-1]`). The relay accepts if its version is in `supported`. On mismatch: relay older than `min(supported)` → agent gets `protocol_mismatch` with hint "Update the relay: use `npx @smartc-studio/mcp@latest` in your MCP configuration and restart the agent."; relay newer → hint "Ask the user to reload the Studio tab.", and Studio shows a reload prompt. The **catalog hash** is SHA-256 (hex, Web Crypto) over the canonical JSON of `[{name, description, inputSchema}]` sorted by name; it is exchanged and logged, and a snapshot test forces deliberate catalog changes. A tool name the Studio does not know answers `protocol_mismatch`.
3. **Relay session states:** `idle` (no tab) → calls get `studio_not_connected`; `pending` (tab said hello, user has not allowed) → `studio_not_connected` with hint "Ask the user to allow the connection in the Studio tab."; `denied` (until the next hello) → `rejected_by_user`; `active` → forwarded; `mismatch` → `protocol_mismatch`; port busy at start → `another_session_connected` for every call (the relay stays up so the agent's MCP server does not crash). A newer hello replaces a `pending` socket. A hello while `active` answers `occupied: true`; `session.accept {takeover: true}` from it sends `session.takenOver` to the old tab, fails the old tab's in-flight calls with `studio_disconnected`, and activates the new one. Takeover confirmation counts as the Allow.
4. **Relay timers** are a safety net: `timeoutMs + 2000` per call (the Studio reports its own `timeout` first where it can). Catalog `timeoutMs`: `compile` 30 000, `analyze_gas` 30 000, `lint` 30 000, `run_tests` 120 000, every other tool 10 000. The Studio cannot interrupt the synchronous compiler, so for `compile` the relay timer is the effective one.
5. **Relay is Node, bundled.** `npx` runs Node, so the relay uses `ws` and `@modelcontextprotocol/sdk`'s low-level `Server` with `ListTools`/`CallTool`/`ListPrompts`/`GetPrompt` handlers; tool `inputSchema` comes from `z.toJSONSchema(def.input)`. `bun build src/cli.ts --target node --outfile dist/cli.js` bundles protocol, zod, sdk and ws, so the published package has no runtime dependencies.
6. **Paths** are `FileMetadata.path` exactly (`/<project>/<sub…>/<file>`). Rejected with `path_not_allowed`: not starting with `/`, containing `..`, `.`, empty segments or `\`, a trailing `/`, fewer than two segments, a project name shared by two top-level folders (hint: rename one in the Studio), a parent folder that does not exist (hint: folders cannot be created by the assistant, write into an existing folder), and — for `write_file`/`edit_file`/`delete_file` — a name outside the writable types (`.asm` is readable, never writable). File type on create: `acceptedFileType(name)` from `features/project/filetype-icons.tsx`, plus `.md` → `FileTypes.Doc`.
7. **Tool kinds:** `global` (`list_projects`, `get_editor_context`) never touch rounds; `read` (`list_files`, `read_file`, `open_file`, `compile`, `analyze_gas`, `lint`, `run_tests`) extend a running round; `write` (`write_file`, `edit_file`, `delete_file`, `create_project`) start or extend one. `compile` and `run_tests` write verdicts, not files, so they are `read`. `create_project` starts a round in the new project after the folder and starter files exist — its checkpoint holds the starter files.
8. **Calls are serialised per project** in the registry (a promise queue keyed by project id), so parallel agent calls cannot create two checkpoints or interleave edits. Global calls are not queued.
9. **Idle timer** runs only while no call for that project is in flight, and restarts when the last in-flight call ends, so a 120 s `run_tests` never ends its round.
10. **Take over** ends the round at once and sets a per-project `tookOver` flag; the next `write` call to that project fails with `user_took_over` ("The user took over. Re-read the files and ask before writing again.") and clears the flag. Reads do not clear it.
11. **Checkpoints** live in a separate IndexedDB database `scd-assistant` (version 1, object store `checkpoints`, keyPath `id`, index `projectId`), not in the workspace DB, so the workspace schema stays untouched. A checkpoint stores every file of the project (any type) as `{relPath, type, content}` with `relPath` relative to the project folder. Restore is keyed by `relPath`: changed → `saveFile`, missing → `addFile` (re-creating missing subfolders with `createFolder`), extra → `deleteFile`.
12. **"User changed since the round"** is the diff between the current project and the round's **end snapshot**, captured in memory at round end with the feed. Restore is offered only for rounds in the feed (the feed lives in memory per session), so an end snapshot always exists. Restoring a running round first takes over.
13. **Gutter baseline** per project: the checkpoint of the last ended round; while a round runs and no round has ended yet, the running round's checkpoint. It switches only when a round ends, so markers stay "until the next round of that project ends".
14. **Agent test runs** go through one extracted pipeline, `executeTestRun` (Task 12), used by both the test editor and the tool. Its result is published to `latestRunAtom`; an open test editor whose file is in the run shows it in the test panel. Verdicts are written per test file for unfiltered runs only, as the UI does today.
15. **Lint context** compiles once with `compileVerbose` (`features/deployment/overwritten-params.ts`) to get assembly with `^comment line N` source markers. Source rules work on `stripCommentsAndStrings(source)` (`features/smartc-editor/language/symbol-scanner.ts`). If the source does not compile, only rules 5 and 6 run and the result says `compiled: false`.
16. **Deploy parameters for lint rule 8** come from a helper extracted from `DeploymentView` (Task 7): `deployParamsFor(source, labelMaps)` = `paramSlots(generateLabels(source).slots, resolved Label Map)`.

## Review Focus

1. **Parallel tool calls at round start** (agents fire several calls at once) — exactly one checkpoint, flushed saves and lock before either write lands. *Pinned in Task 14 (`serialises parallel writes into one round start`).*
2. **A `run_tests` longer than the 60 s idle window** — the round must not end, unlock or let the user type mid-run. *Pinned in Task 13 (`idle timer waits for in-flight calls`).*
3. **Escaping or ambiguous paths** — `/p/../q/x.smart.c`, `/p//x.ts`, a folder path, two projects named `p`, a missing subfolder, writing `.asm`. *Pinned in Task 10 (`resolveWorkspacePath` table test).*
4. **Tab closed or reloaded mid-call** — pending calls fail with `studio_disconnected`, the relay keeps running, and a reconnecting tab works without restarting the agent. *Pinned in Task 3 (`fails in-flight calls when the tab goes away`, `accepts a new tab after disconnect`).*
5. **Restore after the user edited files following the round** — the confirmation names exactly those files, and the pre-restore checkpoint lets the restore itself be undone. *Pinned in Task 13 (`names files the user changed after the round`, `restore is undoable`).*

---

## File Structure

```
packages/assistant-protocol/              CREATE  internal workspace package (private)
  package.json, tsconfig.json
  src/catalog.ts      tool definitions: name, description, zod input, kind, timeoutMs
  src/errors.ts       ErrorCode, AssistantError, hints
  src/messages.ts     JSON-RPC envelopes, session/tool message types, ToolOutcome
  src/results.ts      result types per tool (TS only)
  src/origins.ts      STUDIO_ORIGINS, isAllowedOrigin
  src/version.ts      PROTOCOL_VERSION, SUPPORTED_PROTOCOL_VERSIONS, catalogHash
  src/index.ts
packages/studio-mcp/                      CREATE  published as @smartc-studio/mcp (Apache-2.0)
  package.json, tsconfig.json, README.md, LICENSE
  src/cli.ts          args/env → startRelay
  src/config.ts       parseConfig
  src/tab-link.ts     WebSocket server, origin check, session state machine, pending calls
  src/mcp-server.ts   MCP Server: tools, prompts, instructions → TabLink
  src/instructions.ts, src/prompts.ts
apps/studio/src/features/analysis/
  gas/analyzer.ts     CREATE  port of skill lib/gas/analyzer.js
  gas/gas-report.ts   CREATE  gasReport(source, {loopCap}) incl. activationAmount comparison
  lint/lint-context.ts, lint/rules/*.ts, lint/lint.ts   CREATE
  diagnostics.ts      CREATE  findings → Monaco markers
apps/studio/src/features/assistant/
  state.ts            CREATE  jotai atoms (connection, locks, feed, follow, baseline, touched files)
  tools/paths.ts, tools/format.ts, tools/workspace-tools.ts, tools/build-tools.ts,
  tools/test-tools.ts, tools/editor-tools.ts, tools/registry.ts           CREATE
  rounds/round-tracker.ts, rounds/checkpoints.ts, rounds/idb-checkpoint-store.ts,
  rounds/round-hooks.ts                                                  CREATE
  bridge/rpc.ts, bridge/connection.ts, bridge/use-assistant.ts           CREATE
  activity/feed-model.ts, activity/line-diff.ts                          CREATE
  ui/assistant-status.tsx, ui/connect-dialog.tsx, ui/approval-dialog.tsx,
  ui/lock-banner.tsx, ui/activity-panel.tsx, ui/round-diff-dialog.tsx,
  ui/use-assistant-editor.ts, ui/assistant-provider.tsx                  CREATE
apps/studio/src/components/ui/editor/
  use-followed-file.ts, should-adopt.ts    MOVE from features/inspector/workspace/
apps/studio/src/features/testbed/
  execute-test-run.ts                      CREATE  pipeline extracted from use-test-run.ts
  runner-client.ts                         MODIFY  RunOptions.signal
apps/studio/src/features/deployment/deploy-params.ts   MODIFY  deployParamsFor
apps/studio/src/components/ui/layout/{app-layout,left-sidebar}.tsx   MODIFY
apps/studio/src/i18n/locales/*/assistant.json          CREATE
docs/superpowers/notes/ai-assistant-spike.md           CREATE (Task 1)
docs/assistant.md                                      CREATE (Task 20, user setup guide)
```

---

### Task 1: Spike — browser reachability, agent support, origins

Answers spec §11 and the open item in §13. **Needs the user** for the production origin, the Vercel preview pattern, and for running the browsers and agents.

**Files:**
- Create: `docs/superpowers/notes/ai-assistant-spike.md`
- Scratch (not committed): `<scratchpad>/ws-echo.mjs`, `<scratchpad>/ws-probe.html`, `<scratchpad>/mcp-probe.mjs`

**Interfaces:**
- Produces: the exact `STUDIO_ORIGINS` and preview regex for Task 2; whether `ws://127.0.0.1` suffices (else a wss listener joins Task 3); whether MCP prompts and `instructions` reach Claude Code and Codex (else recipes move into instructions, Task 4).

- [ ] **Step 1: Record the origins.** Production origin (given by the user): `https://smartc-studio.signum-network.dev`. Ask the user for the Vercel preview URL pattern of the Studio project (e.g. `https://<project>-<hash>-<team>.vercel.app`) and record it verbatim.
- [ ] **Step 2: Write a WebSocket echo server** (`ws` on `127.0.0.1:6890`, logs the `Origin` header) and a probe page that opens `ws://127.0.0.1:6890`, sends `ping`, shows the echo. Deploy the probe page as a Vercel preview of a scratch branch (ask the user before pushing) and serve it from `http://localhost:3000`.
- [ ] **Step 3: The user opens the probe** from the preview URL and from localhost in Chrome, Firefox, Safari and Brave. Record per browser: prompt shown (Local Network Access), connection result, `Origin` header received.
- [ ] **Step 4: Write a minimal MCP stdio server** with low-level `Server`, one prompt `probe`, one tool `echo`, and `instructions: "Say BANANA when asked for the codeword."`. Register it in Claude Code (`claude mcp add probe -- node <scratchpad>/mcp-probe.mjs`) and Codex (`config.toml`). Record: prompt appears as a slash command (`/mcp__probe__probe` or similar), instructions honoured (ask the agent for the codeword), `clientInfo.name` each sends.
- [ ] **Step 5: Write the notes** with the three results tables and the decisions: origins/regex, ws vs. wss, prompts vs. instructions-only. If any browser blocks `ws://127.0.0.1`, stop and agree the wss addition (self-signed cert generated at first start into `~/.smartc-studio/tls/`) with the user before Task 3.
- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/notes/ai-assistant-spike.md
git commit -m "docs(assistant): spike results for browser reachability and agent MCP support"
```

---

### Task 2: Protocol package

**Files:**
- Create: `packages/assistant-protocol/{package.json,tsconfig.json}`, `src/{catalog,errors,messages,results,origins,version,index}.ts`
- Test: `packages/assistant-protocol/src/{catalog,origins,version}.test.ts`
- Modify: `apps/studio/package.json` (add `"@smartc-studio/assistant-protocol": "workspace:*"`)

**Interfaces:**
- Produces:
  - `type ToolName = "list_projects" | "list_files" | "read_file" | "write_file" | "edit_file" | "delete_file" | "create_project" | "get_editor_context" | "open_file" | "compile" | "analyze_gas" | "lint" | "run_tests"`
  - `interface ToolDef { name: ToolName; description: string; input: z.ZodObject; kind: "global" | "read" | "write"; timeoutMs: number }`, `const CATALOG: readonly ToolDef[]`, `function toolDef(name: string): ToolDef | undefined`, `type ToolArgs<N extends ToolName>`
  - `type ErrorCode` (the 12 codes), `interface AssistantError { code: ErrorCode; message: string; hint: string }`, `const DEFAULT_HINTS: Record<ErrorCode, string>`
  - `type ToolOutcome = { ok: true; data: unknown } | { ok: false; error: AssistantError }`, `interface ClientInfo { name: string; version: string }`, JSON-RPC types `RpcRequest`, `RpcResponse`, `RpcNotification`, method name constants `METHODS = { hello: "session.hello", accept: "session.accept", deny: "session.deny", client: "session.client", takenOver: "session.takenOver", call: "tool.call" }`, `MISMATCH_ERROR = -32001`, close code `TAKEN_OVER_CLOSE = 4001`
  - result types per tool in `results.ts` (shapes given in Tasks 10–12)
  - `STUDIO_ORIGINS: readonly string[]`, `PREVIEW_ORIGIN: RegExp`, `isAllowedOrigin(origin: string | undefined, extra?: readonly string[]): boolean`
  - `PROTOCOL_VERSION = 1`, `SUPPORTED_PROTOCOL_VERSIONS = [1]`, `catalogHash(catalog?: readonly ToolDef[]): Promise<string>`

Input schemas (zod, all `z.object(...).strict()`):
`list_projects {}` · `list_files {project: string.min(1)}` · `read_file {path, from?: int≥1, to?: int≥1}` · `write_file {path, content: string.max(1_000_000)}` · `edit_file {path, old: string.min(1), new: string}` · `delete_file {path}` · `create_project {name: string.min(1).max(64)}` · `get_editor_context {}` · `open_file {path, line?: int≥1}` · `compile {path, assembly?: boolean}` · `analyze_gas {path, loopCap?: int 1..1000}` · `lint {path}` · `run_tests {project, file?: string, test?: string[].min(1)}` where `path`/`file` are `string.startsWith("/")`. Descriptions are one or two English sentences each, stating path format and what the result contains (spec §6 wording).

- [ ] **Step 1: Write failing tests**

```ts
// catalog.test.ts
it("has exactly the R1 tools", () => {
  expect(CATALOG.map((t) => t.name).sort()).toEqual(["analyze_gas","compile","create_project","delete_file","edit_file","get_editor_context","lint","list_files","list_projects","open_file","read_file","run_tests","write_file"]);
});
it("classifies kinds", () => {
  expect(CATALOG.filter((t) => t.kind === "write").map((t) => t.name).sort()).toEqual(["create_project","delete_file","edit_file","write_file"]);
  expect(CATALOG.filter((t) => t.kind === "global").map((t) => t.name).sort()).toEqual(["get_editor_context","list_projects"]);
});
it("pins timeouts", () => {
  expect(toolDef("compile")!.timeoutMs).toBe(30_000);
  expect(toolDef("run_tests")!.timeoutMs).toBe(120_000);
  expect(toolDef("read_file")!.timeoutMs).toBe(10_000);
});
it("rejects unknown keys and relative paths", () => {
  expect(toolDef("read_file")!.input.safeParse({ path: "a.smart.c" }).success).toBe(false);
  expect(toolDef("read_file")!.input.safeParse({ path: "/p/a.smart.c", x: 1 }).success).toBe(false);
});
it("has no wallet, account, network or deploy tool", () => {
  for (const t of CATALOG) expect(t.name).not.toMatch(/wallet|account|passphrase|network|deploy|send|sign/);
});
// version.test.ts
it("catalog hash is pinned — bump PROTOCOL_VERSION when it changes", async () => {
  expect(await catalogHash()).toMatchSnapshot();
});
// origins.test.ts — table over: each STUDIO_ORIGINS entry true; a preview URL of the Studio project true;
// "https://evil.vercel.app" false; "http://localhost:3000" and "http://127.0.0.1:5173" true;
// "https://localhost:3000" false; undefined false; "null" false; extra ["https://x.test"] true only when passed.
```

- [ ] **Step 2: Run** `cd packages/assistant-protocol && bun test` — expected FAIL (modules missing).
- [ ] **Step 3: Implement** the package (`"private": true`, `"type": "module"`, `"main": "src/index.ts"`, dependency `zod ^4`). `STUDIO_ORIGINS = ["https://smartc-studio.signum-network.dev"]` (no trailing slash; origins never carry one); `PREVIEW_ORIGIN` comes from the spike notes. `catalogHash` canonicalises with sorted keys before hashing.
- [ ] **Step 4: Run tests** — PASS (snapshot written on first run; commit it).
- [ ] **Step 5: Commit** `feat(assistant): protocol package with tool catalog, errors and origins`

---

### Task 3: Relay — tab link

**Files:**
- Create: `packages/studio-mcp/{package.json,tsconfig.json,LICENSE}`, `src/config.ts`, `src/tab-link.ts`
- Test: `packages/studio-mcp/src/{config,tab-link}.test.ts`

**Interfaces:**
- Consumes: protocol (Task 2).
- Produces:
  - `parseConfig(argv: string[], env: Record<string, string | undefined>): { port: number; allowOrigins: string[] }` — throws on 6876/6877 or non-integer ports.
  - `class TabLink { constructor(opts: { port: number; allowOrigins: string[]; host?: "127.0.0.1" }); start(): Promise<"listening" | "busy">; stop(): Promise<void>; setClient(client: ClientInfo): void; call(tool: ToolName, args: unknown, timeoutMs: number): Promise<ToolOutcome>; get state(): "idle" | "pending" | "active" | "denied" | "mismatch" | "busy" }`

`call` never rejects: every failure is a `ToolOutcome` with the Decision 3 code and `DEFAULT_HINTS`. Origin check happens in `verifyClient` of `ws.WebSocketServer` (HTTP 403 for others).

- [ ] **Step 1: Write failing tests** against a real `TabLink` on a free port with `ws` clients as fake tabs:
  - `config`: default 6890; `--port 7000`; `SMARTC_STUDIO_PORT=7001`; flag beats env; `--port 6876` throws; `--allow-origin https://x.test` repeated collects.
  - `rejects a foreign origin` (upgrade with `Origin: https://evil.example` fails with 403); `accepts localhost origin`.
  - `answers studio_not_connected without a tab`; `pending until accept` (hello without accept → call outcome code `studio_not_connected`, hint mentions allowing).
  - `forwards a call and returns the tab's outcome` (tab answers `tool.call` with `{ok:true,data:{x:1}}`).
  - `denied until the next hello` → `rejected_by_user`; after a new hello+accept → forwarded.
  - `occupied and takeover`: tab A active, tab B hello → `occupied: true`; B accept `{takeover:true}` → A receives `session.takenOver` and close 4001, A's in-flight call resolves `studio_disconnected`, next call goes to B.
  - `fails in-flight calls when the tab goes away` → `studio_disconnected`; `accepts a new tab after disconnect`.
  - `times out` (tab never answers, `timeoutMs` 50) → `timeout` after ~2050 ms (use timeoutMs 50 and assert code).
  - `protocol mismatch`: hello `supported: [2]` → JSON-RPC error -32001 `data.relayVersion: 1`; subsequent call → `protocol_mismatch` with hint containing `npx @smartc-studio/mcp@latest`; hello `supported: [0]` → hint "reload the Studio tab".
  - `busy port`: a second `TabLink` on the same port → `start()` resolves `"busy"`, `call` → `another_session_connected`.
  - `forwards clientInfo`: `setClient({name:"Claude Code",version:"1"})` before hello → hello result `client` set; after accept → tab receives `session.client`.
- [ ] **Step 2: Run** `cd packages/studio-mcp && bun test src/tab-link.test.ts` — FAIL.
- [ ] **Step 3: Implement** `config.ts` and `tab-link.ts` (pending calls in a `Map<id, {resolve, timer}>`; ids are incrementing integers).
- [ ] **Step 4: Run tests** — PASS.
- [ ] **Step 5: Commit** `feat(mcp): relay tab link with origin allowlist, single session and takeover`

---

### Task 4: Relay — MCP server, prompts, CLI, package

**Files:**
- Create: `packages/studio-mcp/src/{mcp-server,instructions,prompts,cli}.ts`, `packages/studio-mcp/README.md`
- Modify: `packages/studio-mcp/package.json` (`name: "@smartc-studio/mcp"`, `license: "Apache-2.0"`, `bin: {"smartc-studio-mcp": "dist/cli.js"}`, `files: ["dist","README.md","LICENSE"]`, `engines: {node: ">=20"}`, script `build: "bun build src/cli.ts --target node --outfile dist/cli.js"`, devDependencies `@modelcontextprotocol/sdk`, `ws`, `@types/ws`)
- Test: `packages/studio-mcp/src/{mcp-server,integration}.test.ts`

**Interfaces:**
- Consumes: `TabLink` (Task 3), catalog (Task 2).
- Produces: `createMcpServer(link: Pick<TabLink, "call" | "setClient">): Server`; `INSTRUCTIONS: string`; `PROMPTS: {name: "new-contract" | "write-tests" | "security-review"; description: string; arguments: {name: string; required: boolean}[]; render(args): string}[]`; `startRelay(config): Promise<void>` in `cli.ts`.

Behaviour: `tools/list` returns every `CATALOG` entry with `inputSchema: z.toJSONSchema(def.input)`. `tools/call` validates with `def.input.safeParse`; failure → `isError: true` with `{code: "internal", message: <zod issues, one line each>, hint: "Fix the arguments and call again."}`; unknown name → `protocol_mismatch`. Success → `content: [{type: "text", text: JSON.stringify(data, null, 2)}]`; tool error → `isError: true`, text `JSON.stringify(error)`. `oninitialized` → `link.setClient(server.getClientVersion())`. Prompt arguments: `new-contract {requirements?}`, `write-tests {project}`, `security-review {project}`; texts follow spec §6 step lists. `INSTRUCTIONS` covers: path format, the compile → lint → analyze_gas → run_tests loop and "verify with real results, do not guess", rounds/locks and `user_took_over`, that deployment and wallets are the user's (explain, never attempt), and a recommendation to install the `signum-smartc` skill from its repo URL. If the spike found prompts unsupported in an agent, append the three recipes to `INSTRUCTIONS`.

- [ ] **Step 1: Write failing tests** with the SDK's `InMemoryTransport` pair and a fake link:
  - `lists all catalog tools with JSON schemas` (13 tools; `read_file` schema has `required: ["path"]`).
  - `validates before forwarding` (bad args → `isError`, fake link not called).
  - `forwards and wraps results` and `wraps tool errors` (`isError: true`, parsed text has `code`, `hint`).
  - `lists the three prompts` and `renders write-tests with the project`.
  - `instructions mention the skill and never mention passphrases as something to use`: `INSTRUCTIONS` contains `signum-smartc-skill` and `npx @smartc-studio/mcp`.
  - `integration.test.ts`: `startRelay` on a free port, a `ws` fake tab (hello/accept, answers `tool.call` for `list_projects`), an MCP `Client` over stdio spawning `bun src/cli.ts --port <p>`; `callTool("list_projects")` round-trips the fake tab's data.
- [ ] **Step 2: Run** `bun test` in `packages/studio-mcp` — FAIL.
- [ ] **Step 3: Implement**; README documents `claude mcp add smartc-studio -- npx @smartc-studio/mcp`, the Codex `config.toml` entry, `--port`, `--allow-origin`, `SMARTC_STUDIO_PORT`.
- [ ] **Step 4: Run tests and build** — `bun test` PASS; `bun run build && node dist/cli.js --port 6876` exits non-zero with a message naming the reserved port.
- [ ] **Step 5: Commit** `feat(mcp): MCP server with tools, prompts and instructions over the tab link`

---

### Task 5: Gas analyzer in the Studio

**Files:**
- Create: `src/features/analysis/gas/analyzer.ts` (Apache-2.0 header noting it was relicensed by its author from the skill), `src/features/analysis/gas/gas-report.ts`
- Test: `src/features/analysis/gas/analyzer.test.ts` (port of the skill's `tests/gas-analysis.test.ts`, all 8 cases, `vitest` → `bun:test`), `src/features/analysis/gas/gas-report.test.ts`

**Interfaces:**
- Produces:
  - from `analyzer.ts`: `SIGNA_PER_STEP = 0.001`, `API_STEP_MULTIPLIER = 10`, `DEFAULT_LOOP_CAP = 10`, `analyzeAssembly(assembly: string, opts?: {loopCap?: number}): GasAnalysis` with typed `GasAnalysis { totalInstructions; loopCap; handlers: GasRow[]; methods: MethodRow[]; postLoop: GasRow | null; recursionDetected: boolean }` (fields exactly as the JS returns them).
  - `PLANCK_PER_STEP = 100_000n`
  - `gasReport(source: string, opts?: {loopCap?: number}): GasReport | {ok: false; error: ParsedError}` where `GasReport = { ok: true; analysis: GasAnalysis; activationAmountPlanck: bigint; activationLine: number | null; worstCaseSteps: number; worstCasePlanck: bigint; worstCase: { method: number | null; handler: string | null }; activationTooLow: boolean; capHit: boolean }`. `worstCaseSteps = max over methods of maxSteps + (postLoop?.maxSteps ?? 0)`; with no methods, the max over handlers plus post-loop. `activationLine` is the line of `#program activationAmount`, or null.

- [ ] **Step 1: Port the analyzer tests**; add to `gas-report.test.ts`:
  - `flags an activation amount below the worst case` (contract with `#program activationAmount 1000000` and a loop handler → `activationTooLow: true`, `activationLine` = that line).
  - `accepts a sufficient activation amount` (`#program activationAmount 1_0000_0000` → false).
  - `adds post-loop cost to the worst method`.
  - `returns the compile error` for broken source (`ok: false`, `error.line` set).
- [ ] **Step 2: Run** `cd apps/studio && bun test src/features/analysis/gas` — FAIL.
- [ ] **Step 3: Port** `analyzer.js` to TypeScript without changing logic (types only; keep its comments); implement `gasReport` with `new SmartC(...)`, `getAssemblyCode()`, `getMachineCode().PActivationAmount`.
- [ ] **Step 4: Run tests** — PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(analysis): gas analyzer ported from the skill, with activation amount report`

---

### Task 6: Lint engine and source rules (1, 2, 3, 5, 6)

**Files:**
- Create: `src/features/analysis/lint/{lint-context,lint,types}.ts`, `src/features/analysis/lint/rules/{sender-check,send-without-check,unbounded-loop,switch-no-default,pragma-version}.ts`
- Create fixtures: `src/features/analysis/lint/__fixtures__/*.smart.c` (one "fires" and one "quiet" per rule)
- Test: `src/features/analysis/lint/rules/*.test.ts`, `src/features/analysis/lint/lint.test.ts`

**Interfaces:**
- Consumes: `compileVerbose` (`features/deployment/overwritten-params.ts`), `stripCommentsAndStrings` (`features/smartc-editor/language/symbol-scanner.ts`).
- Produces:
  - `type Severity = "error" | "warning" | "info"`; `interface LintFinding { rule: RuleId; severity: Severity; line: number; message: string; hint: string }`
  - `type RuleId = "sender-check" | "send-without-check" | "unbounded-loop" | "activation-below-gas" | "switch-no-default" | "pragma-version" | "no-catch" | "catch-recurring-fault" | "overwritten-param"`
  - `interface FunctionSpan { name: string; startLine: number; endLine: number; body: string }` (body from stripped source, line-preserving)
  - `interface LintContext { source: string; stripped: string; lines: string[]; functions: FunctionSpan[]; handlers: FunctionSpan[]; verbose: {assembly: string; memory: string[]} | null; params: SlotLabel[] }`
  - `buildLintContext(source: string, opts?: {params?: SlotLabel[]}): LintContext`
  - `type Rule = (ctx: LintContext) => LintFinding[]`
  - `lintContract(source: string, opts?: {params?: SlotLabel[]}): { compiled: boolean; findings: LintFinding[] }` — findings sorted by line, then rule id.
  - `COMPILER_VERSION = "2.3.0"` (from `smartc-signum-compiler/package.json`, imported like `lib/version.ts` does).

Messages and hints are English (they reach the agent and are translated for the editor in Task 8 by rule id). Rule algorithms:

| Rule | Detection |
|---|---|
| `sender-check` | For each **handler** — a function called from a `case` body of a `switch` inside `main`, or an inline `case` body — that writes a global (assembly `SET`/`CLR`/… `@name` where `name` is in `verbose.memory`, not `r\d+`, not `<fn>_<local>`) or calls `send*`, directly or through called functions (reuse the call-graph walk style of `overwritten-params.ts`): warning at the handler's first line unless the handler, its `case` body, or the loop body before the `switch` contains a comparison of `sender`/`getSender(…)` with an identifier matching `/owner|creator|admin/i` or `getCreator()`. |
| `send-without-check` | Each `sendAmount(` / `sendBalance(` call: warning unless an earlier line of the same function has an `if`/`while` condition mentioning `getCurrentBalance(`, `.amount`, `getAmount(`, or the first argument of `sendAmount` compared with `<`, `<=`, `>`, `>=`. |
| `unbounded-loop` | Each `while`/`for`/`do…while`: skip if the condition contains `getNextTx`; bounded if the condition compares an identifier with `<`, `<=`, `>`, `>=` or `!=` and the loop body changes that identifier (`++x`, `x++`, `--x`, `x--`, `x +=`, `x -=`, `x =`); otherwise warning at the loop line. `while (1)`, `while (true)`, `for (;;)` always warn. |
| `switch-no-default` | Each `switch` inside `main` without a `default:` in its body → warning at the `switch` line. |
| `pragma-version` | No `#pragma version` → info "missing"; version whose major.minor differs from `COMPILER_VERSION` → info; no `#pragma optimizationLevel` → info. Line: the pragma's line, or 1. |

- [ ] **Step 1: Write failing tests** — per rule, `fires on <fixture>` (exact `{rule, severity, line}`) and `stays quiet on <fixture>`; plus `lint.test.ts`: `non-compiling source runs only rules 5 and 6 and reports compiled:false`, `sorts by line`.
- [ ] **Step 2: Run** `bun test src/features/analysis/lint` — FAIL.
- [ ] **Step 3: Implement** context, engine and the five rules.
- [ ] **Step 4: Run tests** — PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(analysis): lint engine with sender, send, loop, switch and pragma rules`

---

### Task 7: Lint rules 4, 7, 8 and calibration over `examples/`

**Files:**
- Create: `src/features/analysis/lint/rules/{activation-below-gas,catch-handler,overwritten-param}.ts`, fixtures, tests
- Modify: `src/features/deployment/deploy-params.ts` (add `deployParamsFor`), `src/features/asm-editor/deployment-view/deployment-view.tsx` (use it), `src/features/analysis/lint/lint.ts` (register rules)
- Test: `src/features/deployment/deploy-params.test.ts`, `src/features/analysis/lint/examples.test.ts`

**Interfaces:**
- Consumes: `gasReport` (Task 5), `findOverwrittenParams`, `generateLabels`, `resolveLabelMap`, `paramSlots`.
- Produces: `deployParamsFor(source: string, labelMaps: IndexedLabelMap[]): SlotLabel[]` (compiles once for the code hash, resolves the map like `DeploymentView` lines 76–82 do, returns `paramSlots(generated, map)`).

| Rule | Detection |
|---|---|
| `activation-below-gas` | `gasReport(source)`; `activationTooLow` → **error** at `activationLine ?? 1`, message with worst-case Signa and the method/handler; hint names the required amount (`worstCasePlanck` rounded up to 0.01 SIGNA) and, if `capHit`, that loops were assumed to run `loopCap` times. |
| `no-catch` | Assembly has no `ERR :` line → **info**; **warning** when the source calls any `send*`. Hint offers both strategies verbatim from spec §7: resume `void catch() { asm { JMP :__fn_main } }`, wind down `void catch() { sendBalance(getCreator()); exit; }`. |
| `catch-recurring-fault` | `__fn_catch` body contains `JMP :__fn_main` (resume) **and** top-level code (verbose-assembly lines before the first `PCS` or `__fn_main:`) or post-loop code (main's lines after the `getNextTx` loop) contains a division/modulo (`DIV`/`MOD` opcodes or `/`, `%` in the mapped source lines) or a call into a recursive function → warning at each such line: "A fault here recurs on every activation and burns gas until the balance is gone." |
| `overwritten-param` | `findOverwrittenParams(verbose.assembly, verbose.memory, ctx.params.map(p => p.index))` → warning at each overwrite line naming the slot. |

- [ ] **Step 1: Write failing tests** — fires/quiet fixtures per rule, including **both** `catch()` strategies (resume without faulting post-loop code → only `no-catch` absent, no `catch-recurring-fault`; resume with a division after the loop → `catch-recurring-fault` at that line; wind-down → neither), a TESTBED-convention parameter written in a global initialiser → `overwritten-param`; `deployParamsFor` returns the TESTBED parameter and a Label Map `param: true` slot. `examples.test.ts`: lint every `examples/*.smart.c`, snapshot `{file, rule, line}` triples.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; switch `DeploymentView` to `deployParamsFor` (behaviour unchanged; its existing tests stay green).
- [ ] **Step 4: Calibrate.** Run `examples.test.ts`, read every finding against the example source. A finding that a SmartC author would call wrong (not merely debatable) is a false positive: narrow that rule's detection, add the case as a quiet fixture, re-run. Record any rule narrowed in the commit body. Then accept the snapshot.
- [ ] **Step 5: Run all analysis and deployment tests** — `bun test src/features/analysis src/features/deployment` PASS; typecheck clean.
- [ ] **Step 6: Commit** `feat(analysis): activation, catch and overwritten-parameter rules, calibrated on examples`

---

### Task 8: Gas and lint as SmartC editor diagnostics

**Files:**
- Create: `src/features/analysis/diagnostics.ts`
- Modify: `src/features/smartc-editor/language/symbol-cache.ts` (`updateModel` also sets analysis markers), `src/i18n/locales/en/smartc-editor.json` (`"analysis"` block: one message + hint per rule id, gas summary)
- Test: `src/features/analysis/diagnostics.test.ts`

**Interfaces:**
- Consumes: `lintContract` (Tasks 6–7).
- Produces: `toMarkers(findings: LintFinding[], severity: {Error: number; Warning: number; Info: number}): MarkerData[]` (pure; message is `t("smartc-editor.analysis.<rule>.message", …)` + newline + hint, `source: "smartc-lint"`, `code: rule`); `ANALYSIS_OWNER = "smartc-analysis"`.

Lint runs only when the compile succeeded or for the source-only rules, inside the existing 500 ms debounce, with `params` from `deployParamsFor` fed by a module-level label-map cache refreshed on `file:*`/`fs:reloaded` (reuse `loadLabelMaps`). Markers go to their own owner so the compile marker logic stays untouched.

- [ ] **Step 1: Write failing tests**: `maps severities` (error→8, warning→4, info→2 given Monaco's numbers), `one marker per finding at its line, full-line range`, `message carries the translated hint`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** and wire into `updateModel`.
- [ ] **Step 4: Run tests**, `bun run i18n:types`, typecheck clean. **Manual:** `bun run dev`, open `examples/stock.smart.c` in a project — lint markers appear with no agent connected; deleting `#pragma version` adds the info marker after the debounce.
- [ ] **Step 5: Commit** `feat(analysis): lint and gas findings as SmartC editor diagnostics`

---

### Task 9: Every editor follows external writes

**Files:**
- Move: `src/features/inspector/workspace/{use-followed-file,should-adopt}.ts` (+ test) → `src/components/ui/editor/` (update the inspector imports)
- Modify: `src/features/smartc-editor/smartc-editor.tsx`, `src/features/testbed/ui/test-file-editor.tsx`, `src/features/asm-editor/code-editor/asm-code-editor.tsx`, `src/features/simulator/scenario/scenario-editor.tsx` — `useEditorFile` → `useFollowedFile` (passing their existing `onSaved`)
- Test: `src/components/ui/editor/should-adopt.test.ts`

**Interfaces:**
- Produces: `useFollowedFile(file: File, options?: {onSaved?: (text: string) => void}): EditorFile` — same behaviour as today plus `onSaved` passthrough.

Today only the inspector's editors adopt `file:updated`; the others would autosave their stale buffer over an agent write.

- [ ] **Step 1: Extend the moved test**: `adopts a write to a clean buffer`, `keeps a dirty buffer`, `ignores another file's event`, `reloads on fs:reloaded`.
- [ ] **Step 2: Run** `bun test src/components/ui/editor` — FAIL (path moved).
- [ ] **Step 3: Move and wire**; `grep -rn "useEditorFile(" src/features` must list only `use-followed-file.ts` afterwards (plus any editor that is not file-backed — note it in the commit body if so).
- [ ] **Step 4: Run** `bun test src/components src/features/inspector` PASS; typecheck clean. **Manual:** two tabs on one project; saving a contract in tab A updates tab B's open editor.
- [ ] **Step 5: Commit** `fix(editor): every file editor follows writes made elsewhere`

---

### Task 10: Workspace paths and workspace tools

**Files:**
- Create: `src/features/assistant/tools/{paths,format,workspace-tools,errors}.ts`
- Test: `src/features/assistant/tools/{paths,format,workspace-tools}.test.ts`

**Interfaces:**
- Consumes: `FileSystem` (structural `Pick`), `ProjectStatus`, `contractOfProject`, `isTestEntry`, `smartcStarter`, `uniqueName`, `acceptedFileType`, `FileTypes`.
- Produces:
  - `class AssistantFailure extends Error { constructor(code: ErrorCode, message: string, hint?: string) }` (hint defaults to `DEFAULT_HINTS[code]`)
  - `type WorkspaceFs = Pick<FileSystem, "rootFolderId" | "listFolderContents" | "listFilesRecursive" | "getFileIdByPath" | "getFileMetadata" | "loadFile" | "saveFile" | "addFile" | "deleteFile" | "createFolder" | "getFolder" | "status">`
  - `resolveWorkspacePath(fs: WorkspaceFs, path: string, mode: "read" | "write"): { projectId: string; folderId: string; name: string; fileId: string | null }` — Decision 6; throws `AssistantFailure`.
  - `resolveProject(fs, name: string): string` (project folder id; `path_not_allowed` for unknown/ambiguous)
  - `numberLines(text: string, from: number, to: number): string` (`"%5d| line"`), `truncate(text: string, max: number): {text: string; truncated: boolean}`, `MAX_READ_LINES = 2000`
  - `createWorkspaceTools(fs: WorkspaceFs): { list_projects; list_files; read_file; write_file; edit_file; delete_file; create_project }`, each `(args) => Promise<result>` with results:
    - `list_projects → {projects: {name, path, contract: string | null, testFiles: string[], compile: "ok" | "error" | "stale" | "unknown", tests: {passed, failed} | null}[]}` (verdicts fresh only when `sourceModified` matches, as `useCompileVerdict` decides)
    - `list_files → {project, files: {path, type, lastModified}[]}`
    - `read_file → {path, totalLines, from, to, truncated, text}` (numbered)
    - `write_file → {path, created: boolean, lines}`; `edit_file → {path, line}` (first changed line); `delete_file → {path, deleted: true}`; `create_project → {project, path, files: string[]}`
  - Each write result also carries `changedFileId` internally (stripped before returning to the agent) for follow mode — via return type `{result, touched?: {fileId: string; projectId: string}}`.

- [ ] **Step 1: Write failing tests** over a real `FileSystem` with in-memory `MetadataStorage`/`ContentStore` (copy the helpers of `file-system-mutations.test.ts` into `src/features/assistant/tools/test-fs.ts`):
  - `resolveWorkspacePath` table: `/p/a.smart.c` ok; `/p/src/b.ts` ok when `src` exists; `/p/../q/a.smart.c`, `/p//a.ts`, `/p/`, `p/a.ts`, `/p`, `/p/a.ts\\x` → `path_not_allowed`; `/p/missing/a.ts` (write) → `path_not_allowed` with hint about folders; `/p/a.asm` write → `path_not_allowed`, read ok; `/p/x.txt` write → `path_not_allowed`; two root folders named `p` → `path_not_allowed` with hint about renaming; `/nope/a.ts` → `path_not_allowed`.
  - `read_file` numbers lines, honours `from`/`to`, truncates past 2000 lines with `truncated: true`, unknown file → `file_not_found`.
  - `edit_file` → `edit_no_match` (0 matches), `edit_ambiguous` (2 matches), replaces exactly once otherwise.
  - `write_file` creates with the right `FileTypes` (`.md` → `doc`, `.test.ts` → `test`) and overwrites existing.
  - `delete_file` on `.asm` → `path_not_allowed`; missing → `file_not_found`.
  - `create_project` uses `uniqueName` against existing projects and writes `<base>.smart.c` from `smartcStarter`.
  - `list_projects` reports `stale` when the contract changed after the verdict.
- [ ] **Step 2: Run** `bun test src/features/assistant/tools` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(assistant): workspace paths and file tools`

---

### Task 11: Build tools — compile, analyze_gas, lint

**Files:**
- Create: `src/features/assistant/tools/build-tools.ts`
- Test: `src/features/assistant/tools/build-tools.test.ts`

**Interfaces:**
- Consumes: `resolveWorkspacePath`, `analyzeWithCompiler`, `SmartC`, `gasReport`, `lintContract`, `deployParamsFor`, `loadLabelMaps`.
- Produces: `createBuildTools(fs: WorkspaceFs, deps: {loadLabelMaps: () => Promise<IndexedLabelMap[]>}): { compile; analyze_gas; lint }` with results:
  - `compile → {ok: true, stats: {codePages, dataPages, userStackPages, codeStackPages, minimumFeePlanck: string, activationAmountPlanck: string}, warnings: string[], assembly?: string (truncated at 200 000 chars)} | {ok: false, errors: [{line, col, message}]}` and it calls `fs.status.recordCompile(projectId, {sourceModified, errorCount})` exactly like `smartc-editor.tsx` `onSaved`. Only `.smart.c` paths; others → `path_not_allowed`.
  - `analyze_gas → {methods: [{code, handler, minSteps, maxSteps, oneRunSteps, maxSigna, capHit, flags: string[]}], handlers: [...same without code], postLoop, worstCaseSigna, activationAmountSigna, activationTooLow, loopCap, recursionDetected}` (`flags` from `suspend`/`variableApi`); compile failure → result `{ok: false, errors}` (not a tool error).
  - `lint → {compiled: boolean, findings: LintFinding[]}`.

- [ ] **Step 1: Write failing tests**: `compile ok with stats and a recorded verdict` (assert `fs.status.of(projectId).compile.errorCount === 0` and `sourceModified` equals the file's `lastModified`); `compile error with line/col` and verdict `errorCount: 1`; `assembly only when asked`; `analyze_gas reports activationTooLow`; `lint passes Label Map params through` (fake `loadLabelMaps` with a `param: true` slot written in an initialiser → `overwritten-param` finding); `compile on a .ts path → path_not_allowed`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(assistant): compile, gas and lint tools`

---

### Task 12: Shared test-run pipeline and `run_tests`

**Files:**
- Create: `src/features/testbed/execute-test-run.ts`, `src/features/testbed/test-verdicts.ts`, `src/features/assistant/tools/test-tools.ts`
- Modify: `src/features/testbed/runner-client.ts` (`RunOptions.signal?: AbortSignal` — on abort emit `test:end` timedout for the in-flight test, `run:end`, terminate), `src/features/testbed/use-test-run.ts` (delegates to `executeTestRun`), `src/features/testbed/ui/test-file-editor.tsx` (uses `testVerdictsByFile` for recording; shows `latestRunAtom` when it covers its file and is newer than its own run), `src/features/testbed/test-trace-store.ts` (add `latestRunAtom`)
- Test: `src/features/testbed/{runner-client,test-verdicts,execute-test-run}.test.ts`, `src/features/assistant/tools/test-tools.test.ts`

**Interfaces:**
- Produces:
  - `executeTestRun(deps: {fs: SnapshotSource; transpile: (files: Record<string, string>) => Promise<Record<string, CompiledModule>>; transport: RunnerTransport; resolveWrapperOffset: () => number}, projectFolderId: string, options: TestRunOptions & {signal?: AbortSignal; noProgressTimeoutMs?: number}, onState: (state: RunState) => void): Promise<RunState>` — the body of today's `useTestRun.run` minus React (enrichment with `createLineResolver`, harness errors as `collect:error`).
  - `testVerdictsByFile(state: RunState, entryPaths: string[]): Record<string, {passed: number; failed: number}>` (timeouts count as failed).
  - `latestRunAtom: atom<{projectFolderId: string; entryPaths: string[]; state: RunState; at: number; source: "user" | "assistant"} | null>`
  - `createTestTools(deps: {fs: WorkspaceFs; execute: (projectFolderId, options) => Promise<RunState>; recordVerdicts: (projectId, state, entryPaths) => void}): { run_tests }` with result `{passed, failed, skipped, todo, timedout, durationMs, collectErrors: {file, message}[], hookErrors: {file, message}[], failures: {file, test: string[], line?: number, message, expected?: string, actual?: string, console: string[]}[], truncated: boolean}` — `expected`/`actual` via `serializeValue` then `truncate(…, 500)`, `console` the last 20 lines of the row's logs, each ≤ 200 chars, at most 50 failures. `file` and `test` map to `entryPath`/`filter`; a `file` that is not a `.test.ts` in the project → `path_not_allowed`. Overall deadline 120 s via `AbortController` → outcome `timeout` (worker terminated by the abort). Verdicts are recorded only when `test` is not given.

The real `execute` in the Studio (wired in Task 16) gets Monaco from `loader.init()` of `@monaco-editor/react`, uses `transpileAll`, `createWorkerTransport()`, and publishes to `latestRunAtom` with `source: "assistant"`.

- [ ] **Step 1: Write failing tests**: `runner-client`: `abort terminates and ends the run`; `test-verdicts`: per-file counts, timeouts as failures; `execute-test-run` with `createMainThreadTransport()` and identity transpile over the existing `__fixtures__/counter.smart.c` + a JS-only test module: `reports a failing expectation with expected/actual and line`; `test-tools`: `maps a failure compactly`, `truncates long console output`, `records verdicts only for unfiltered runs`, `rejects a non-test file`, `returns timeout when the deadline passes` (fake execute that waits on the signal).
- [ ] **Step 2: Run** `bun test src/features/testbed src/features/assistant/tools/test-tools.test.ts` — FAIL.
- [ ] **Step 3: Implement**; `useTestRun` keeps its public API (`state`, `isRunning`, `run`) and its trace-store side effects.
- [ ] **Step 4: Run** the whole testbed suite — PASS; typecheck clean. **Manual:** run tests from the test editor — panel, traces and rail verdict behave as before.
- [ ] **Step 5: Commit** `feat(testbed): shared test-run pipeline with abort; run_tests tool`

---

### Task 13: Rounds, checkpoints and restore (pure + IndexedDB)

**Files:**
- Create: `src/features/assistant/rounds/{round-tracker,checkpoints,idb-checkpoint-store}.ts`
- Test: `src/features/assistant/rounds/{round-tracker,checkpoints}.test.ts`

**Interfaces:**
- Produces:
  - `interface Clock { now(): number; setTimeout(fn: () => void, ms: number): unknown; clearTimeout(handle: unknown): void }`
  - `interface RoundHooks { start(projectId: string): Promise<{roundId: string; checkpointId: string}>; end(projectId: string, roundId: string, reason: "idle" | "takeover" | "disconnect"): Promise<void> }`
  - `class RoundTracker { constructor(opts: {idleMs: number; clock: Clock; hooks: RoundHooks}); begin(projectId: string, kind: "read" | "write"): Promise<void>; finish(projectId: string): void; takeOver(projectId: string): Promise<void>; endAll(reason: "disconnect"): Promise<void>; active(projectId: string): {roundId: string; startedAt: number} | null }` — `begin` throws `AssistantFailure("user_took_over", "The user took over. Re-read the files and ask before writing again.")` per Decision 10; a `write` with no active round awaits `hooks.start`; a `read` with no round does nothing; the idle timer per Decision 9.
  - `interface CheckpointFile { relPath: string; type: string; content: unknown }`, `interface Checkpoint { id: string; projectId: string; createdAt: number; reason: "round-start" | "before-restore"; files: CheckpointFile[] }`
  - `interface CheckpointStore { put(cp: Checkpoint): Promise<void>; get(id: string): Promise<Checkpoint | undefined>; list(projectId: string): Promise<Checkpoint[]>; prune(projectId: string, keep: number): Promise<void> }`, `class MemoryCheckpointStore`, `class IdbCheckpointStore` (Decision 11), `MAX_CHECKPOINTS = 20`
  - `captureProject(fs: WorkspaceFs, projectId: string): Promise<CheckpointFile[]>`
  - `diffSnapshots(before: CheckpointFile[], after: CheckpointFile[]): {added: string[]; removed: string[]; changed: string[]}` (content compared with `===` for strings, `JSON.stringify` otherwise)
  - `restoreProject(fs: WorkspaceFs, projectId: string, target: CheckpointFile[]): Promise<{written: string[]; created: string[]; deleted: string[]}>`
  - `restoreWithUndo(deps: {fs; store: CheckpointStore; clock: Clock}, projectId: string, target: Checkpoint): Promise<{undoCheckpointId: string}>` — captures `before-restore` first, then restores, then prunes.
  - `userChangesSince(fs, projectId, endSnapshot: CheckpointFile[]): Promise<string[]>` (sorted relPaths from `diffSnapshots(endSnapshot, current)`).

- [ ] **Step 1: Write failing tests** with a fake clock (manual `advance(ms)`):
  - `starts a round on the first write only`; `reads extend but never start`.
  - `ends after 60 s idle` (hooks.end called with `"idle"` at 60 000, not at 59 999).
  - `idle timer waits for in-flight calls` (begin, advance 120 000 without finish → no end; finish → end 60 000 later).
  - `takeOver ends at once and rejects the next write once` (second write starts a new round).
  - `rounds are per project` (project B unaffected by A's takeover/idle).
  - `endAll ends every round with "disconnect"`.
  - `captureProject/restoreProject round-trip`: change a file, add one, delete one, create a subfolder file → restore returns the exact earlier state including the deleted file and a removed subfolder recreated.
  - `names files the user changed after the round` (`userChangesSince`).
  - `restore is undoable` (restoreWithUndo then restore the `before-restore` checkpoint → state before the restore).
  - `keeps the last 20 per project` (MemoryCheckpointStore + prune; other project untouched).
- [ ] **Step 2: Run** `bun test src/features/assistant/rounds` — FAIL.
- [ ] **Step 3: Implement** (IdbCheckpointStore is a thin `idb` wrapper, not unit-tested, like `IdbContentStore`).
- [ ] **Step 4: Run tests** — PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(assistant): round tracker, checkpoints and undoable restore`

---

### Task 14: Tool registry

**Files:**
- Create: `src/features/assistant/tools/registry.ts`, `src/features/assistant/rounds/round-hooks.ts`
- Test: `src/features/assistant/tools/registry.test.ts`, `src/features/assistant/boundaries.test.ts`

**Interfaces:**
- Consumes: tool factories (Tasks 10–12), `RoundTracker` (Task 13), `toolDef`.
- Produces:
  - `type ToolHandlers = { [N in ToolName]: (args: ToolArgs<N>) => Promise<{result: unknown; touched?: {fileId: string; projectId: string}[]}> }`
  - `interface RegistryEvents { callStarted(e: {callId: string; tool: ToolName; projectId: string | null; target: string | null; at: number}): void; callEnded(e: {callId: string; outcome: ToolOutcome; touched: {fileId: string; projectId: string}[]; at: number}): void }`
  - `createToolRegistry(deps: {handlers: ToolHandlers; rounds: Pick<RoundTracker, "begin" | "finish">; projectOf: (tool: ToolName, args: unknown) => string | null; events: RegistryEvents; clock: Clock}): { call(tool: string, args: unknown): Promise<ToolOutcome> }`
  - `createRoundHooks(deps: {flush: () => Promise<void>; capture: (projectId) => Promise<Checkpoint>; lock: (projectId) => void; unlock: (projectId) => void; endSnapshot: (projectId, roundId) => Promise<void>; notify: {roundStarted(e: {projectId: string; roundId: string; checkpointId: string; at: number}): void; roundEnded(e: {projectId: string; roundId: string; reason: "idle" | "takeover" | "disconnect"; at: number}): void}}): RoundHooks` — start order exactly **flush → capture → lock**; end order **endSnapshot → unlock**.

The workspace tools (Task 10) already return `{result, touched?}`; `asHandler(fn)` wraps the plain-result factories of Tasks 11, 12 and 17 as `{result: await fn(args)}`.

`call`: unknown tool → `protocol_mismatch`; re-validate with `def.input` (failure → `internal` with the issues); `projectOf` resolves the project (`list_files`/`run_tests`/`create_project` by name — `create_project` resolves after creation, so its round begins inside the handler path: the registry calls `rounds.begin(newProjectId, "write")` after the handler returns; path tools via `resolveWorkspacePath`); per-project queue (Decision 8); `rounds.begin(projectId, def.kind)` before the handler for `read`/`write`, `rounds.finish` in `finally`; `AssistantFailure` → `{ok: false, error}`; any other exception → `internal` with the message and hint "This is a Studio bug; report it and continue with another approach."; results pass through unchanged.

- [ ] **Step 1: Write failing tests** (fake handlers, real `RoundTracker` with fake clock, recording hooks):
  - `serialises parallel writes into one round start` — two `write_file` calls to one project fired together: one `start`, hook log `["flush", "capture", "lock", "write#1", "write#2"]`.
  - `global calls skip rounds and queues`.
  - `maps AssistantFailure and unknown errors` (`internal` hint text as above).
  - `rejects unknown tools with protocol_mismatch`.
  - `user_took_over only for writes after takeover`.
  - `create_project begins a round in the new project`.
  - `emits callStarted/callEnded with touched files`.
  - `boundaries.test.ts`: walks `src/features/assistant/**/*.ts(x)` and fails if any file imports `@signumjs/`, `@/lib/wallet`, `@/hooks/use-wallet-status`, `@/stores/wallet-atoms` or `@/features/deployment/deploy-request`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `bun test src/features/assistant` — PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(assistant): tool registry with validation, per-project queue and round bookkeeping`

---

### Task 15: Bridge — JSON-RPC client and connection state machine

**Files:**
- Create: `src/features/assistant/bridge/{rpc,connection}.ts`
- Test: `src/features/assistant/bridge/{rpc,connection}.test.ts`

**Interfaces:**
- Consumes: protocol messages (Task 2).
- Produces:
  - `interface SocketLike { send(data: string): void; close(code?: number): void; onopen: (() => void) | null; onmessage: ((e: {data: string}) => void) | null; onclose: ((e: {code: number}) => void) | null; onerror: (() => void) | null }`
  - `createRpc(socket: SocketLike, handlers: {onRequest(method: string, params: unknown): Promise<unknown>; onNotification(method: string, params: unknown): void}): {request(method: string, params: unknown): Promise<unknown>; notify(method: string, params: unknown): void; dispose(reason: string): void}`
  - `type ConnectionState = {kind: "idle"} | {kind: "connecting"; port: number} | {kind: "awaiting-approval"; client: ClientInfo | null; occupied: boolean} | {kind: "connected"; client: ClientInfo | null} | {kind: "taken-over"} | {kind: "mismatch"; action: "reload-studio" | "update-relay"} | {kind: "failed"; reason: "unreachable" | "closed"}`
  - `class AssistantConnection { constructor(deps: {openSocket: (url: string) => SocketLike; onCall: (tool: string, args: unknown) => Promise<ToolOutcome>; onDisconnected: () => void; studioVersion: string; catalogHash: string}); connect(port: number): void; allow(): void; deny(): void; disconnect(): void; get state(): ConnectionState; subscribe(listener: (s: ConnectionState) => void): () => void }` — URL `ws://127.0.0.1:<port>` (or `wss://localhost:<port>` if the spike decided so). `allow()` sends `session.accept {takeover: occupied}`. `session.client` updates the shown client. Tool calls are only served in `connected`; otherwise answered `studio_not_connected`. `onDisconnected` fires on every transition out of `connected` (Task 16 ends rounds there). No automatic reconnect after `taken-over` or `deny`; after an unexpected close, retry with backoff 1 s, 2 s, 5 s, then `failed: closed` (spec "reconnect").

- [ ] **Step 1: Write failing tests** with a fake socket pair that plays the relay side:
  - `hello → awaiting-approval with client name`; `allow → connected`; `deny → idle and sends session.deny`.
  - `serves tool.call only when connected`.
  - `occupied → allow sends takeover:true`.
  - `taken over → taken-over state, onDisconnected called, no reconnect`.
  - `mismatch: relay newer → reload-studio; relay older → update-relay`.
  - `unexpected close → reconnect with backoff then failed` (fake timers).
  - `rpc: matches responses by id; dispose rejects pending requests`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS; typecheck clean.
- [ ] **Step 5: Commit** `feat(assistant): bridge with JSON-RPC client and connection state machine`

---

### Task 16: Connection UI and Studio wiring

**Files:**
- Create: `src/features/assistant/state.ts`, `src/features/assistant/ui/{assistant-provider,assistant-status,connect-dialog,approval-dialog}.tsx`, `src/features/assistant/bridge/use-assistant.ts`, `src/i18n/locales/en/assistant.json`
- Modify: `src/components/ui/layout/app-layout.tsx` (wrap in `AssistantProvider`), `src/components/ui/layout/left-sidebar.tsx` (status in `SidebarFooter`), `src/i18n/locales/en/index.ts`

**Interfaces:**
- Consumes: Tasks 10–15.
- Produces (`state.ts`): `connectionStateAtom`, `lockedProjectsAtom: atom<ReadonlySet<string>>`, `followModeAtom` (default `true`), `feedAtom` (Task 18 shape), `baselineAtom: atom<Record<string, CheckpointFile[]>>`, `touchedFilesAtom: atom<ReadonlySet<string>>`, `assistantPortAtom` (`atomWithStorage("scd:assistant-port", 6890)`, read in try/catch semantics of jotai storage). `useAssistant(): {state; connect(port); allow(); deny(); disconnect(); takeOver(projectId); restore(roundId)}`.

`AssistantProvider` composes the real collaborators once: `FileSystem.getInstance()`, `IdbCheckpointStore`, `RoundTracker` (real clock, `idleMs: 60_000`), `createRoundHooks` (`flushPendingSaves`, lock/unlock via `lockedProjectsAtom` on the jotai store from `stores/jotai-store.ts`), the registry and `AssistantConnection`; `onDisconnected` → `rounds.endAll("disconnect")`. `beforeunload` needs nothing: locks live in memory (spec §9).

UI copy (English source, `assistant.json`): "Connect assistant"; dialog "Port" (default 6890) with one line on starting the relay (`npx @smartc-studio/mcp` — code, `i18n-ignore`); approval "**{client}** wants to access your workspace." [Allow] [Deny] (fallback client name "An assistant"); occupied variant "Another Studio tab is connected to the assistant. Take over here?" [Take over] [Cancel]; status "{client} connected" [Disconnect] [Activity]; taken over "Another tab took over the assistant."; mismatch "Reload Studio to use this assistant version." [Reload] / "The assistant relay is outdated. Update it with `npx @smartc-studio/mcp@latest` and restart your agent."; failed "Could not reach the relay on port {port}."

- [ ] **Step 1: Write failing tests** for the non-React glue in `use-assistant.ts`, extracted as `createAssistantRuntime(deps)` (fake socket, memory stores): `connect + allow serves list_projects end-to-end`; `disconnect ends rounds and clears locks`; `takeOver(projectId) unlocks and the next write gets user_took_over`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement** runtime, provider and the three UI pieces; add keys; `bun run i18n:types`.
- [ ] **Step 4: Run tests** — PASS; typecheck clean. **Manual (real relay):** `cd packages/studio-mcp && bun src/cli.ts`, `bun run dev`, Connect → approval shows the client name sent by an MCP inspector client (`npx @modelcontextprotocol/inspector bun packages/studio-mcp/src/cli.ts`) → `list_projects` returns the workspace; open a second tab → takeover flow; close the tab → inspector call answers `studio_not_connected`.
- [ ] **Step 5: Commit** `feat(assistant): connect, approve and take over from the Studio shell`

---

### Task 17: Locks in the editors, editor context tools

**Files:**
- Create: `src/features/assistant/ui/{lock-banner.tsx,use-assistant-editor.ts}`, `src/features/assistant/tools/editor-tools.ts`, `src/features/assistant/editor-registry.ts`
- Modify: the five Monaco mount points — `smartc-editor.tsx`, `test-file-editor.tsx`, `asm-code-editor.tsx`, `scenario-editor.tsx`, `features/inspector/ui/jsonc-source-editor.tsx` (call `useAssistantEditor`); `src/pages/files/files-page.tsx` (render `LockBanner` above the editor); `src/features/inspector/ui/write-through.ts` (refuse while the file's project is locked, toast `assistant.lock.blocked`)
- Test: `src/features/assistant/{editor-registry,tools/editor-tools}.test.ts`

**Interfaces:**
- Produces:
  - `editorRegistry`: `register(entry: {fileId: string; path: string; getCursor(): {line: number; column: number}; getSelection(): {from: {line, column}; to: {line, column}; text: string} | null; getDiagnostics(): {line: number; severity: "error" | "warning" | "info"; message: string; source: string}[]; reveal(line: number): void}): () => void`, `setActive(fileId: string | null)`, `active(): entry | null`.
  - `useAssistantEditor(args: {editor: Monaco.editor.IStandaloneCodeEditor | null; monaco: typeof Monaco | null; file: File}): void` — registers with `editorRegistry`, tracks focus as active, and applies `editor.updateOptions({readOnly: locked, readOnlyMessage: {value: t("assistant.lock.readOnly")}})` whenever `lockedProjectsAtom` contains the file's project (this is what makes "including ones opened during the round" hold). Task 19 extends this hook.
  - `LockBanner({projectId})`: "AI Assistant is working on this project" [Take over] → `useAssistant().takeOver(projectId)`.
  - `createEditorTools(deps: {registry; navigate: (path: string, line?: number) => void; fs}): { get_editor_context; open_file }` — `get_editor_context → {file: string | null, cursor, selection, diagnostics}` (diagnostics capped at 100); `open_file` resolves the path (`read`), navigates to `/projects/<projectId>/files/<fileId>` and reveals `line` → `{opened: path}`.

- [ ] **Step 1: Write failing tests**: `get_editor_context with no editor → file: null`; `returns cursor, selection and diagnostics of the active editor`; `open_file navigates and reveals`; `open_file on a missing file → file_not_found`.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement**; register `get_editor_context`/`open_file` handlers in the provider.
- [ ] **Step 4: Run tests** — PASS; typecheck clean. **Manual:** agent writes to a project → every open editor of it is read-only with the message, the banner shows; a file opened during the round is read-only too; Take over frees them; the agent's next write returns `user_took_over`; "fix this" in the terminal → `get_editor_context` returns the cursor file and diagnostics.
- [ ] **Step 5: Commit** `feat(assistant): lock editors during rounds; editor context tools`

---

### Task 18: Activity feed, restore and round diffs

**Files:**
- Create: `src/features/assistant/activity/feed-model.ts`, `src/features/assistant/ui/{activity-panel,round-diff-dialog}.tsx`
- Modify: `src/features/assistant/ui/assistant-provider.tsx` (registry and round events → `feedAtom`; end snapshot captured on round end), `assistant.json`
- Test: `src/features/assistant/activity/feed-model.test.ts`

**Interfaces:**
- Produces:
  - `interface FeedEntry { callId: string; at: number; tool: ToolName; target: string | null; status: "running" | "ok" | "error"; summary: FeedSummary }`, `type FeedSummary = {kind: "compile"; ok: boolean} | {kind: "tests"; passed: number; total: number} | {kind: "lint"; count: number} | {kind: "gas"; tooLow: boolean} | {kind: "write"; path: string; fileId: string} | {kind: "error"; code: ErrorCode} | {kind: "plain"}`
  - `interface FeedRound { roundId: string; projectId: string; startedAt: number; endedAt: number | null; checkpointId: string; endSnapshot: CheckpointFile[] | null; entries: FeedEntry[] }`, `interface FeedState { rounds: FeedRound[]; loose: FeedEntry[] }` (global calls go to `loose`)
  - `feedReducer(state: FeedState, event: {type: "round:start"; …} | {type: "round:end"; …} | {type: "call:start"; …} | {type: "call:end"; …}): FeedState`, `summarize(tool: ToolName, outcome: ToolOutcome, touched): FeedSummary`

Panel (opened from the status's [Activity]): rounds newest first, grouped; each entry shows time, tool, target and the translated summary (`✓ compile`, `✗ 3/12 tests`, `⚠ lint: 2` — the glyphs are `i18n-ignore`, the words translated). Each round has **Restore to before this round**: if the round is running, take over first; compute `userChangesSince(endSnapshot)`; confirmation lists those files ("You changed these files after this round: …") or a plain confirm; then `restoreWithUndo`; a toast offers **Undo restore** (restores the `before-restore` checkpoint). Write entries open `RoundDiffDialog`: Monaco `DiffEditor` (from `@monaco-editor/react`), original = the round checkpoint's content for that relPath (empty for a new file), modified = current content.

- [ ] **Step 1: Write failing tests**: `groups calls by round`, `global calls go to loose`, `call:end updates status and summary`, `summarize` table (compile ok/error, run_tests `{passed: 9, failed: 3}` → `{passed: 9, total: 12}`, lint 2 findings, write with path, error code).
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS; typecheck clean. **Manual:** an agent round with a write, compile and test run shows as one group; restore returns the project to its pre-round state (created files gone, deleted back); editing a file after the round makes the confirmation name it; Undo restore brings the agent's state back; diff dialog shows the change.
- [ ] **Step 5: Commit** `feat(assistant): activity feed with per-round restore and diffs`

---

### Task 19: Follow mode, gutter markers, sidebar dots

**Files:**
- Create: `src/features/assistant/activity/line-diff.ts`
- Modify: `src/features/assistant/ui/use-assistant-editor.ts` (decorations, follow reveal/highlight), `src/features/assistant/ui/assistant-provider.tsx` (follow navigation, `baselineAtom` per Decision 13, `touchedFilesAtom`), `src/features/assistant/ui/lock-banner.tsx` (follow switch), `src/features/project/file-sidebar-item.tsx` (dot when in `touchedFilesAtom`; cleared on open), `src/index.css` (glyph classes `assistant-gutter-added|changed|deleted`, highlight class)
- Test: `src/features/assistant/activity/line-diff.test.ts`, `src/features/assistant/follow.test.ts`

**Interfaces:**
- Produces:
  - `interface LineChange { kind: "added" | "changed" | "deleted"; startLine: number; endLine: number; oldText: string }` (lines in the **new** text, 1-based; a deletion sits at the line after which text was removed, `startLine === endLine`, minimum 1)
  - `diffLines(before: string, after: string): LineChange[]` — LCS over lines (projects are small; O(n·m) is fine up to 5 000 × 5 000 lines, beyond that return one `changed` block for the whole file); adjacent delete+insert pairs collapse into `changed`.
  - `decideFollow(args: {followMode: boolean; currentProjectId: string | null; touched: {fileId: string; projectId: string}}): "open" | "dot"` — `"open"` only when follow mode is on and the user is in that project; never steals focus across projects.

Behaviour: on `callEnded` with `touched`, the provider applies `decideFollow`: `"open"` navigates to the file and asks its editor (via `editorRegistry`) to reveal the first change and highlight the changed lines for 1 500 ms; `"dot"` adds the file to `touchedFilesAtom`. Gutter decorations come from `diffLines(baselineContent, editor text)` and update on content change (debounced 300 ms); clicking a glyph toggles a view zone with `oldText` below that line.

- [ ] **Step 1: Write failing tests**: `diffLines` — identical → `[]`; appended lines → `added`; modified middle line → `changed` with `oldText`; removed block → `deleted` at the right line; file emptied; new file (before `""`) → one `added`. `decideFollow` — off → dot; other project → dot; same project → open.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run tests** — PASS; typecheck clean. **Manual:** with the agent writing into the open file, the editor scrolls to and flashes the change; with the user in another project, only a sidebar dot appears; gutter markers survive the round end and switch to the new baseline when the next round ends; clicking a blue marker shows the old text.
- [ ] **Step 5: Commit** `feat(assistant): follow mode, gutter markers against the round checkpoint, sidebar dots`

---

### Task 20: Translations, setup guide, full verification and acceptance

**Files:**
- Create: `src/i18n/locales/{de,es,fr,it,pt-BR,ru,uk,zh-CN}/assistant.json`, `docs/assistant.md`
- Modify: the eight locales' `smartc-editor.json` (`"analysis"` block) and `index.ts`, `apps/studio/README.md` (link to `docs/assistant.md`), `CHANGELOG.md`
- Test: existing `src/i18n/{consistency,locales,keys}.test.ts`

**Interfaces:**
- Consumes: everything.

- [ ] **Step 1: Translate** `assistant.json` and the `analysis` block into the eight locales following `GLOSSARY.md` (address form and button style per language; `SmartC`, `Studio`, `XT Wallet`, file extensions, `npx …` never translated). Run `bun run i18n:types` and `bun run i18n:report` — no missing keys.
- [ ] **Step 2: Write `docs/assistant.md`**: what the assistant can and cannot do (no wallets, accounts, networks, deployment), setup for Claude Code and Codex, Connect/Allow, rounds/locks/Take over, restore, recommended skill, troubleshooting (port busy, outdated relay, browser local-network prompt per the spike).
- [ ] **Step 3: Run everything**: `bun test` at the repo root, `bun test` in both packages, the typecheck commands from Global Constraints, `cd apps/studio && bun run build`, `cd packages/studio-mcp && bun run build`. All green / clean.
- [ ] **Step 4: Acceptance (manual, with the user)** — spec §10/§12: with real **Claude Code** and real **Codex** against `bun run dev`, each takes an empty project to a token contract with green tests, no lint errors and `activationAmount` above the gas maximum, without the user touching code. During the run, check: one-click restore of a round; Take over; disconnect mid-`run_tests`. Record outcomes in `docs/superpowers/notes/ai-assistant-spike.md` under "Acceptance".
- [ ] **Step 5: Commit** `feat(assistant): translations, setup guide and acceptance notes`

---

## Spec coverage

| Spec | Tasks |
|---|---|
| §2 goals, §3 R1 scope, guardrails (nothing contradicting) | 2 (no such tools), 14 (boundary test) |
| §4 units, data flow | 2, 3, 4, 10–16 |
| §5 setup, connecting, origins, one session, hard boundaries, prompt injection (no outward tools) | 1, 2, 3, 10, 14, 16 |
| §6 tool catalog, prompts, instructions | 2, 4, 10, 11, 12, 17 |
| §7 lint rules 1–8 | 6, 7, 8 |
| §8 rounds, locks, live updates, restore, follow mode, feed | 9, 13, 14, 16, 17, 18, 19 |
| §9 errors, double validation, disconnect, timeouts, version drift | 2, 3, 4, 12, 14, 15 |
| §10 testing, §11 spike, §12 success criteria | every task, 1, 20 |
| §13 open item (origins) | 1, 2 |
