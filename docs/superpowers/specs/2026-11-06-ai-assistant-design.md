# AI Assistant — Design

**Date:** 2026-11-06
**Status:** Approved (design), pending implementation plan
**Context:** Users bring their own coding agent (Claude Code, Codex, Gemini CLI, …)
to the Studio. This spec covers **Release 1 (R1): the assistant bridge and the
write → compile → test loop**. Later sub-projects are listed in §3 with the
guardrails already decided for them; each gets its own spec.

---

## 1. Problem

Writing a SmartC contract that is safe to hold funds is hard to get right and hard
to check: authorisation, balance handling, gas sizing of `activationAmount`, and the
behaviour of a contract that faults. Coding agents are good at writing code, but
without a way to compile, test and analyse inside the user's workspace they guess.

The Studio already has everything an agent needs to check its work — compiler,
test runner, simulator — but it is a static browser app (no backend, workspace in
IndexedDB/localStorage), while the agents run locally in a terminal and speak MCP.

## 2. Goal

- A user connects **their own** CLI agent to the open Studio tab. Studio ships no
  LLM access of its own.
- The agent reads and writes the Studio workspace, compiles, runs tests, analyses
  gas and lints — and **verifies its work against real results** instead of guessing.
- The user stays in control: they see what the agent does, can take over at any
  moment, and can undo every agent round with one click.
- Funds stay out of reach: in R1 no tool touches wallets, accounts or networks.

### Decisions taken during design

| Topic | Decision |
|---|---|
| Where the conversation happens | The user's own terminal. The Studio workspace stays the source of truth. |
| Bridge | A thin local MCP relay; **every tool executes in the Studio tab** (approach A). Rejected: a headless twin toolchain (two truths, divergent test runner) and a hosted relay (Studio has no backend; user code would cross our server). |
| Write authority | The agent writes directly. Studio checkpoints each agent round and locks the project while the agent works. |
| Safety | Knowledge (the `signum-smartc` skill) **plus** deterministic checks (compiler, tests, gas analysis, lint). |
| Deployment | Always the user's, via XT Wallet or passphrase. The assistant may only explain deployment and navigate to the deploy page (later sub-project). |
| First release | The write → compile → test loop. |
| Licensing | Studio and relay are Apache-2.0. The skill (GPL-3.0, with the vendored Signum-D-Or decompiler) stays a separate companion. The gas analyzer is the author's own work and is relicensed into the Studio. |

## 3. Scope and roadmap

Numbers name the sub-projects; **carbon contracts (2) are built first**, then R1.

| # | Sub-project | Depends on |
|---|---|---|
| **1** | **R1 — assistant bridge + write → compile → test loop**, incl. gas analysis and lint in the editor (this spec) | — |
| 2 | **Carbon contracts in the Studio** — deploy by reference with a parameter form, signed by the user, on every network. A Studio feature in its own right. Spec: `2026-11-06-carbon-contracts-design.md`. | — |
| 3 | **Assistant sandbox** — instance deploys by reference, dev accounts and transactions on the local sandbox | 1, 2 |
| 4 | **Assistant inspection** — watchlists, data stack, maps, Label Map generation (read-only) | 1 |
| 5 | **Inspector M2 disassembly** + assistant tools for it | 1, inspector M2 |

### Guardrails decided for later sub-projects

These are fixed now so R1 does not build anything that contradicts them.

**Permissions**

| Action | Mainnet / testnet | Verified sandbox |
|---|---|---|
| Deploy an original contract (with code) | user only (XT Wallet / passphrase) | user only |
| Deploy an **instance by reference** (carbon) | user only | **agent allowed** |
| Create dev accounts | — | **agent allowed** |
| Send transactions to instances | user only | **agent allowed**, with its own dev accounts only |
| Use XT Wallet or the user's passphrases | never the agent | never the agent |
| Explain deployment, open the deploy page | agent allowed | agent allowed |

**Sandbox identity.** The Signum Sandbox is a full Signum node with a special UI,
running locally (`localhost:6876`). A node counts as the sandbox only if **both** hold:

1. `GET /api?requestType=getConstants` returns `networkName === "Signum-LOCAL-MOCK"`, and
2. its genesis block id is **not** the mainnet or testnet genesis id (hard-coded deny-list).

**Accounts.** Studio manages **no** accounts — that is XT Wallet's job, connected
to the sandbox. Sandbox tools run **in the relay** (Node, via signumjs against the
node API), not in the browser. The agent creates its own dev accounts; the relay
keeps their seeds locally (`~/.smartc-studio/sandbox/<genesis-id>.json`, never in
project files) and `list_dev_accounts` hands them to the user for import into XT.
Every generated seed starts with the marker `sandbox-only-do-not-use-on-mainnet `
so the warning travels with the seed. Funding: the user's forging account in XT is
the de-facto faucet; the agent asks the user for an address and amount, the user sends.

The relay's identity check protects against **mistakes**. An agent with shell
access could call any node directly; the real mainnet boundary is that the agent
never holds funded mainnet keys — those live only in XT Wallet.

## 4. Architecture

```
 Terminal                    local                           Browser (Studio tab)
┌──────────────┐  stdio ┌──────────────────────┐ WebSocket ┌──────────────────────────────┐
│ Claude Code  │◄─MCP──►│ @smartc-studio/mcp   │◄─127.0.0.1►│ features/assistant/          │
│ Codex / …    │        │ relay, Apache-2.0    │ JSON-RPC  │  bridge → tool-registry      │
│ + signum-    │        │ - tool catalog       │           │   ├ workspace  (FileSystem)  │
│   smartc     │        │ - origin allowlist   │           │   ├ compile / gas / lint     │
│   skill (GPL)│        │ - no domain code     │           │   ├ tests (runTests, worker) │
└──────────────┘        └──────────────────────┘           │   ├ rounds / locks / ckpts   │
                                                           │   └ activity feed (UI)       │
                                                           └──────────────────────────────┘
```

### Units

**`packages/assistant-protocol`** (internal workspace package, bundled into the
relay on publish). The tool catalog — names, zod schemas, descriptions — the
protocol version, the error codes, and the origin allowlist. Relay and Studio both
import it, so the catalog cannot drift between them.

**`packages/studio-mcp`**, published as **`@smartc-studio/mcp`**. Speaks MCP over
stdio to the agent and runs a WebSocket server on `127.0.0.1`. It knows the tool
schemas and validates arguments but executes nothing in R1: each call is forwarded
to the connected tab and the answer returned. It also serves MCP `instructions` and
prompts (§6).

**`apps/studio/src/features/assistant/`** (new):

- `bridge` — WebSocket client, connection dialog, reconnect, JSON-RPC.
- `tool-registry` — maps tool names to handlers. Handlers are thin adapters over
  existing modules (`FileSystem`, `runTests` / `snapshotProject`, the compiler,
  `ProjectStatus`). Collaborators are injected, as elsewhere in the Studio, so
  handlers are testable without a browser.
- `rounds` — round state machine, project locks, checkpoints (§8).
- `activity` — feed panel, connection status, follow mode, gutter markers (§8).

**Domain checks in the Studio (Apache-2.0)**, useful with or without an agent:

- `features/analysis/gas` — the gas analyzer from the skill (`lib/gas/analyzer.js`,
  I/O-free), relicensed and ported to TypeScript with its tests.
- `features/analysis/lint` — the SmartC lint rules (§7), run on source and assembly.

Both surface in the SmartC editor as diagnostics and are exposed to the agent as tools.

**The skill** stays independent (GPL-3.0): language and API references, patterns,
testing recipes, decompiler, offline scripts. The relay's MCP `instructions` explain
how to use the Studio tools and recommend installing the skill; they copy none of
its content.

### Data flow of a tool call

Agent → MCP `tools/call` → relay validates the schema → WebSocket request to the
tab → Studio validates again → round bookkeeping (lock, checkpoint) → handler →
existing Studio module → compact structured result → relay → agent. At the same
time the call lands in the activity feed, and an open editor shows the change.

## 5. Connection and boundaries

**Setup.** The agent starts the relay from its MCP configuration, e.g.
`claude mcp add smartc-studio -- npx @smartc-studio/mcp`, or the equivalent entry in
Codex's `config.toml`. The relay listens on `127.0.0.1:6890` (`--port` or
`SMARTC_STUDIO_PORT`; never 6876/6877, which the node uses).

**Connecting.** In the Studio shell, **Connect assistant** opens the socket (port
editable in the dialog, default 6890). The relay forwards the MCP `clientInfo`, and
Studio asks: "**Claude Code** wants to access your workspace. [Allow] [Deny]".
After that the shell shows the connection status with **Disconnect**. Closing the
tab disconnects; the relay then answers every call with `studio_not_connected`.

**Origin allowlist.** The relay accepts WebSocket upgrades only from the exact
Studio production origin(s), the Studio project's own Vercel preview pattern (never
a generic `*.vercel.app`), and `http://localhost:*` / `http://127.0.0.1:*` for
development. `--allow-origin <origin>` adds one. Browsers cannot forge the `Origin`
header, so a hostile web page can neither pose as the Studio nor receive tool calls.
Local processes could forge it, but they already own the machine.

**One session at a time.** One relay, one tab.

- A second tab may take over after the user confirms in it; the first tab shows
  "taken over".
- A second relay finds the port busy and answers every call with
  `another_session_connected` ("Another agent session is connected to Studio").
- A multi-agent hub is out of scope.

**Hard boundaries live in the Studio registry**, not in the relay and not in prompts:

- Paths are workspace paths (`/<project>/<file>`); anything else is `path_not_allowed`.
- Writable file types: `.smart.c`, `.test.ts`, `.ts`, `.scenario.json`,
  `.labels.json`, `.inspect.json`, `.md`.
- R1 registers **no** tool for wallets, passphrases, accounts, networks or
  deployment. What is not registered cannot be called.

**Prompt injection.** The agent reads file contents, and an imported project can
carry crafted comments. R1 has no outward-facing tools, so the blast radius is the
workspace, which checkpoints cover. The agent's own permission prompts stay active.

## 6. Tool catalog (R1)

**Principles.** Results are compact, structured and deterministic, with line numbers.
Long output is truncated and marked as truncated. Results are English (like compiler
and test-runner messages); all Studio UI follows the i18n flow.

**Workspace**

| Tool | Purpose |
|---|---|
| `list_projects` | Projects with their contract, test files and latest compile/test verdicts (from `ProjectStatus`) |
| `list_files(project)` | File tree of a project |
| `read_file(path, {from?, to?})` | Content with line numbers, optionally a line range |
| `write_file(path, content)` | Create or overwrite a file |
| `edit_file(path, old, new)` | Exact replacement; `old` must match exactly once (`edit_no_match` / `edit_ambiguous`) |
| `delete_file(path)` | Covered by checkpoints |
| `create_project(name)` | New project from the existing SmartC and test starters |

**Editor context**

| Tool | Purpose |
|---|---|
| `get_editor_context` | Open file, cursor, selection, current diagnostics — so "fix this" in the terminal works |
| `open_file(path, {line?})` | Shows the user a location in the Studio |

**Build and checks**

| Tool | Purpose |
|---|---|
| `compile(path, {assembly?})` | ok, or errors `[{line, col, message}]`; stats (code and data pages, stacks); optional assembly. Writes the compile verdict exactly like the UI. |
| `analyze_gas(path, {loopCap?})` | Min/max steps and Signa per handler, post-loop cost, flags, and the comparison with `activationAmount` |
| `lint(path)` | Findings `[{rule, severity, line, message, hint}]` (§7) |

**Tests**

| Tool | Purpose |
|---|---|
| `run_tests(project, {file?, test?})` | Summary plus failures with expected/actual, source position and truncated console output. Uses `runTests()` in the worker — exactly what the test panel shows — and writes the test verdict. |

**MCP prompts** (surface as slash commands in agents that support them):

- `new-contract` — clarify requirements → structure per the skill → compile → lint
  → gas → write tests → green.
- `write-tests` — derive handlers and scenarios (happy path, permissions, limits,
  insufficient funds) → run → iterate.
- `security-review` — lint + gas + the skill's analysis checklist → prioritised
  report, no changes.

## 7. Lint rules (R1)

Deterministic, deliberately few, run on source and the compiler's assembly. Each
finding has a rule id, severity (`error`, `warning`, `info`), line and a fix hint.

| # | Rule | Severity |
|---|---|---|
| 1 | A handler that changes state or sends funds **without a sender check** against an owner/creator variable | warning |
| 2 | `sendAmount` / `sendBalance` **without a preceding balance or amount check** | warning |
| 3 | A loop without a recognisable bound (the `getNextTx` loop excepted) | warning |
| 4 | `activationAmount` **below the maximum gas cost** of a handler (via the gas analyzer) | error |
| 5 | `switch` dispatch **without `default`** — unknown methods are accepted silently | warning |
| 6 | Missing `#pragma version` / `optimizationLevel`, or a version different from the Studio's compiler | info |
| 7 | **No global error handler** — no `void catch()` (no `ERR :label` in assembly) | info; warning if the contract calls `send*` |
| 8 | A deploy parameter (`param: true` in the Label Map, or a TESTBED-convention variable) **written by top-level code** — the deployed value is overwritten on first activation. Reuses `findOverwrittenParams` from the carbon contracts spec §5. | warning |

**Rule 7 in detail.** Without a handler, a fatal fault (division by zero, stack
overflow, out of gas) leaves the contract **dead** for good. The hint offers both
strategies:

- **Resume:** `void catch() { asm { JMP :__fn_main } }` — the faulting transaction
  was already consumed by `getNextTx`, so the contract carries on with the next one.
- **Wind down:** `void catch() { sendBalance(getCreator()); exit; }`.

Additional finding for *resume*: if a fault can arise in top-level or post-loop code
(division, recursion), it recurs on every activation and burns gas until the
balance is gone. The rule reports where such code sits.

Lint results appear as editor diagnostics with or without an agent.

## 8. Rounds, locks, checkpoints and the activity feed

**Round.** MCP has no notion of a turn, so the Studio defines one **per project**.
A round starts with the agent's first writing tool call in that project and ends
after 60 seconds without an agent tool call that targets the project (reads,
compiles and test runs count; project-independent calls such as `list_projects`
do not), or when the user takes over. An agent
working on two projects runs two independent rounds; all other projects stay free.

**At round start** Studio, in this order:

1. flushes pending editor saves (`flushPendingSaves()` from `lib/pending-saves`),
2. snapshots the contents of every file in the project as a checkpoint
   (IndexedDB; the last 20 per project are kept),
3. sets **every editor of the project read-only**, including ones opened during
   the round.

**Lock.** A banner above the editor says "AI Assistant is working on this project"
with **[Take over]**; Monaco's `readOnlyMessage` repeats it when the user tries to
type. **Take over** ends the round at once and frees the editors. The agent's next
write to that project fails with `user_took_over` ("The user took over. Re-read the
files and ask before writing again."). At round end the editors are freed
automatically. Since saves are flushed at round start and the project is locked
during the round, agent and user edits cannot conflict.

**Live updates.** Agent writes go through `FileSystem`; open editors take the new
text through the existing `adopt()` of `use-editor-file`. Every editor kind is
checked to follow `file:updated` events; any that does not is fixed as part of R1.

**Restore.**

- One click returns the project to the state before a round: files created later are
  removed, deleted ones come back.
- Before restoring, Studio checkpoints the current state, so a restore can be undone.
- If the user changed files since the checkpoint, Studio names them before confirming.
- The agent cannot restore. The tool belongs to the user.

**Follow mode** (switch in the banner, on by default). Tool calls arrive whole, so
there is no live typing to show and Studio does not fake it. Instead:

- When the agent writes a file of the project the user has open, Studio opens that
  file, scrolls to the first change and briefly highlights the changed lines.
- No focus stealing: if the user is in another project, only a dot in the sidebar
  marks the file.
- Gutter markers against the round's checkpoint (green new, blue changed, red
  deleted) stay until the next round of that project ends. Clicking one shows the
  old text inline.

**Activity feed** (panel opened from the connection status). Entries grouped by
round: time, tool, target, result (`✓ compile`, `✗ 3/12 tests`, `⚠ lint: 2`). Each
round has **Restore to before this round**; a write entry opens a Monaco diff against
the checkpoint. Compile and test results also land where the user expects them —
editor diagnostics and the test panel. The feed lives in memory per session; only
checkpoints persist.

## 9. Error handling

- **One error shape** to the agent: an MCP result with `isError: true` and
  `{code, message, hint}`. Codes: `studio_not_connected`, `studio_disconnected`,
  `another_session_connected`, `rejected_by_user`, `user_took_over`,
  `path_not_allowed`, `file_not_found`, `edit_no_match`, `edit_ambiguous`,
  `timeout`, `protocol_mismatch`, `internal`. The hint always names a sensible
  next step.
- **Double validation**: the relay checks schemas, the Studio checks again.
- **Disconnect mid-call**: pending calls fail with `studio_disconnected`, the round
  ends, locks are released. Locks live in tab memory, so a reload clears them too.
- **Timeouts**: `compile` 30 s, `run_tests` 120 s; on timeout the test worker is
  terminated.
- **Version drift** (Studio deploys continuously, the relay ships via npm): the
  handshake exchanges the protocol version and the catalog hash. Studio supports
  the current and the previous protocol version. On mismatch the relay tells the
  agent to use `npx @smartc-studio/mcp@latest`, or Studio asks the user to reload.

## 10. Testing

All with `bun test`, following the existing patterns.

- **Protocol**: schema tests and a snapshot of the catalog hash, so changes are deliberate.
- **Relay**: units with a fake WebSocket and a fake MCP transport; an integration
  test that starts the relay, connects a fake tab and round-trips a tool call from an
  MCP client; the origin allowlist; behaviour on a busy port.
- **Studio handlers**: in-memory `FileSystem` / `ContentStore` and the existing
  `main-thread-transport` for the runner — no browser.
- **Rounds, locks, checkpoints**: a pure state-machine model with a fake clock.
- **Lint**: per rule, fixtures that must and must not fire — including both
  `catch()` strategies and a fault in post-loop code — plus a run over `examples/`
  to calibrate false positives.
- **Gas analyzer**: the skill's tests move along with it.
- **Acceptance** (manual, before release): with real Claude Code **and** Codex
  against a local Studio, take an empty project to a token contract with green tests
  without the user touching code.

## 11. Spike (first task of the plan)

1. Can a page on the Studio's https production origin and on a Vercel preview open
   `ws://127.0.0.1:6890` in Chrome (Local Network Access prompt), Firefox, Safari
   and Brave? If a browser blocks it, the relay additionally serves
   `wss://localhost` with a locally generated certificate.
2. Do Claude Code and Codex show MCP prompts as slash commands and honour MCP
   `instructions`? If one does not, the recipes move into the instructions text.

## 12. Success criteria (R1)

- Claude Code and Codex each take an empty project to a contract with green tests,
  no open lint errors, and an `activationAmount` above the gas maximum.
- Every agent round can be undone with one click.
- No tool exists that touches a wallet, accounts or a network.
- Gas analysis and lint work in the editor without an agent.

## 13. Out of scope and open items

**Out of scope for R1:** deployment, sandbox, inspector and disassembly tools,
simulator/debugger control, test traces, folder operations, multiple concurrent
agent sessions, an in-Studio chat panel.

**Open:**

- The Studio's production origin(s) and its Vercel preview pattern, for the
  allowlist in `packages/assistant-protocol`.

**Follow-up in the skill (separate repo):** `references/language.md` shows only the
wind-down `catch()` and says a fault sends the balance to the forger, while
`references/assembler-ciyam.md` says the contract goes dead. Document both
consequences together and add the resume pattern (`asm { JMP :__fn_main }`).
