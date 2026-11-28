# Changelog

## Unreleased

### Highlights

- **Edit Markdown files** — `.md` files open in the editor with Markdown
  highlighting and word wrap. Create them with New File; upload, ZIP and
  folder import accept them too.
- **GitHub sync** — import a contract folder from a GitHub repo, link a project
  to one, pull changes (with per-file conflict choices and Undo pull), and
  commit and push from the project menu. A status badge shows whether you are
  in sync. The token stays in your browser, and the AI assistant cannot reach
  sync. See the [guide](docs/git-sync.md).

## 0.4.0-alpha.3 — 2026-11-27

### Highlights

- **See when the agent is working** — the assistant icon at the top right
  pulses green while the agent works, and its tooltip says "… is working".
  It counts as working while it holds a project (the same round that locks the
  editor), while a call runs, and for a few seconds after its last call, so
  read-only steps such as compiling or running tests show too. With reduced
  motion enabled only the colour changes.

## 0.4.0-alpha.2 — 2026-11-27

### Highlights

- **One-command setup for Claude Code** — the Connect dialog's Quick Start now
  installs the [signum-smartc plugin](https://github.com/ohager/signum-smartc-skill):
  `claude plugin install signum-smartc --marketplace ohager/signum-smartc-skill`
  brings the SmartC skill and the relay together, and `/plugin` keeps both up
  to date. With a custom port or a self-hosted Studio the dialog keeps the
  manual steps. Codex and other agents are unchanged.
- The SmartC skill (1.1.0) now tells the agent to use Studio's compile, lint,
  gas and test tools whenever Studio is connected.

### Docs

- [Setup guide](docs/assistant.md): the plugin route, a fallback for older
  Claude Code versions, and a note for native Windows (`cmd /c npx …`).

## 0.4.0-alpha.1 — 2026-11-26

A coding agent can now work on your contracts inside Studio, and contracts can be
deployed by reference. Still **experimental**: projects live in your browser's
storage, so export them as zip regularly.

### Highlights

- **AI Assistant** — let Claude Code, Codex or another MCP agent work on your
  projects. See the [setup guide](docs/assistant.md).
  - **Quick start in Studio** — the assistant icon at the top right opens the
    Connect dialog with copyable setup steps for Claude Code, Codex and other
    agents: register the relay, install the SmartC skill, restart. The commands
    are filled in for your port.
  - The agent can read and edit files, compile, lint, analyse gas and run tests.
    It has no access to wallets, accounts, networks or deployment.
  - Every agent round is checkpointed and locks its project. Take over at any
    moment, follow the changes live, see gutter markers, browse the activity
    feed, and restore a round with one click (and undo the restore).
- **`@smartc-studio/mcp`** — the local MCP relay between your agent and Studio,
  started by the agent itself (`npx -y @smartc-studio/mcp`).
- **Gas analysis and lint in the editor** — worst-case gas against
  `activationAmount`, and checks for missing sender checks, unbounded loops,
  missing `default:` and `catch`, pragma drift and more. They work without an
  agent and are translated into all nine languages.
- **Carbon contracts** — deploy a contract by reference: it reuses the code of
  an existing deployment and brings only its own data stack, at a fraction of
  the cost.
  - The deploy page offers **deploy by reference** when a contract with your
    code hash already exists on the network, and a **parameter form** with a
    data stack preview for deploy parameters.
  - From the inspector, create a **new instance** of any watched contract, even
    without its source.
  - Label Map slots can be marked as deploy parameters; Studio warns when
    top-level code overwrites one.
- **Import completion in the test editor** — relative imports suggest the
  project's folders, test helpers and contracts (`../contract.smart.c?raw`),
  and imported helpers are fully typed before the first run.
- **Inspector network picker** — Mainnet, Testnet, Local testnet, the wallet's
  node or a custom node, with the node URL always visible and the choice
  remembered.

### Fixes

- Tests in a subfolder (`tests/`) run against the whole project, so
  `../contract.smart.c?raw` is found.
- Every file editor follows changes made elsewhere (another tab, the assistant).
- Amount fields can no longer crash the deploy page; a running deploy stays on
  screen.
- An activation amount below the measured gas no longer blocks compiling.
- A replayed test with a long name no longer squeezes the simulator's toolbar
  buttons on top of each other.

## 0.3.0-alpha.1 — 2026-09-30

Studio can look at contracts that are already on chain. Still **experimental**:
projects live in your browser's storage, so export them as zip regularly.

### Highlights

- **Contract Inspector** — read a deployed contract's state by meaning instead of
  by slot index. It is read-only: it sends no transactions and needs no wallet.
  - **Watchlists** (`*.inspect.json`) list the contracts to inspect, each with
    its network (mainnet or testnet). Add contracts by id, by creator or by
    code hash.
  - **Data stack** with labelled slots, a detail view per slot, and values shown
    as number, fixed-point, hex, address, text, bool or enum.
  - **Contract maps** grouped by `key1`, either a fixed key or a pattern, with
    labelled keys and values.
  - **Label Maps** (`*.labels.json`) give slots, map keys and values their names
    and formats. Generate one from a `.smart.c`, or write it by hand in the
    inspector or the editor. A Label Map applies to every contract whose code
    hash it lists, in any project of the workspace. Regenerating it keeps your
    own entries and comments.
  - **Inspect after deploying** — one click after a deployment adds the new
    contract to the project's watchlist and opens it.
- **Inspection-only folders** — a folder that holds only inspection files works
  as a project of its own, without the workflow rail.
- **Editor support for the new files** — completion, hover and diagnostics for
  watchlists and Label Maps. Both are JSON with comments.

## 0.2.0-alpha.1 — 2026-09-29

Studio speaks your language, and gets a face of its own. Still **experimental**:
projects live in your browser's storage, so export them as zip regularly.

### Highlights

- **Nine languages** — English, Deutsch, Português (Brasil), Français, Español,
  Italiano, Українська, Русский and 简体中文, including the editor documentation in
  hover, completion and signature help. Pick one in the sidebar footer; Studio
  starts in your browser's language when it has it. Compiler, assembler and
  test-runner messages stay English.
- **The Register mark** — a new logo, an S spelled by the cells of a memory map,
  in the colours of your climate: favicon, sidebar, home page and a loading
  splash that builds the S while Studio starts.
- **Low-level API in the editor** — `#include APIFunctions` / `fixedAPIFunctions`
  functions (`Get_A1`, `Send_To_Address_In_B`, …) get completion, hover and
  signature help, including which register slots they read and write.
- **Consistent chrome** — the sidebar edge and the panel dividers share one resize
  grip; every scrollbar is thin and tinted with the climate's accent, Monaco's too.

### Fixes

- A test file opened by URL gets its theme.
- The home page says when the screen is too small for Studio.
- Numbers are formatted in the chosen language; byte counts keep their thousands
  separator.
- If the app fails to load (offline, or a tab left open across a deploy), Studio
  says so and offers a reload instead of showing the splash forever.
- Switching language never loses the last keystrokes of an unsaved edit.

## 0.1.0-alpha.1 — 2026-09-27

First public, **experimental** release of Signum SmartC Studio. Expect rough edges and
breaking changes; projects live in your browser's storage, so export them as zip regularly.

### Highlights

- **Projects & files** — nested folders, drag & drop, rename, zip import/export, recently
  opened files, a home page with project overview and learning content.
- **SmartC editor** — dedicated Monaco language with diagnostics, completion, hover,
  signature help and document symbols, backed by the SmartC compiler.
- **Assembly view** — compiled output, contract summary and machine-image details.
- **Simulator & debugger** — scenarios (JSON5), step/step-into, breakpoints, variables,
  registers, watches, ledger and emitted transactions, live pop-out dashboard.
- **Test runner** — `.test.ts` files with vitest-style `describe`/`it`, in-editor gutter
  status, run/debug a single test, inline value traces, and recorded runs turned into
  debuggable scenarios.
- **Workflow rail** — shows how the contract stands from compile through test,
  simulate and deploy.
- **Deploy** — wallet connection and contract deployment, including large contracts.
- **Themes** — four climates (nexus, dawn, solaris, terminal).
