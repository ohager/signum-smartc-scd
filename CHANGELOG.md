# Changelog

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
