# Browser Test Runner for SmartC Studio

**Date:** 2026-08-22
**Status:** Approved design

## Goal

Let a Studio user write and run unit tests for SmartC contracts entirely in the
browser using [`signum-smartc-testbed`](https://github.com/ohager/signum-smartc-testbed),
and move freely between a test and the step debugger in both directions.

Tests are TypeScript, because contract testing needs computation — building hex
messages, deriving expected balances after fees, looping over accounts. But nobody
should start from a blank file: the primary way to create a test is to **generate it
from a debug session** and then edit it.

## Non-goals

- **Vitest export compatibility is not a requirement.** The API is vitest-shaped
  because that shape is familiar and well understood, and a simple generated file
  will most likely still run under vitest — but nothing in the design is constrained
  by keeping that true, and it is not tested.
- Virtual `fs` / `path` modules. Contract source is bound by import (see below).
  These would only ever serve tests pasted from an existing repo; they can be added
  later if anyone asks.
- A project-wide "Tests" page with a run-all-files button. The per-file loop comes
  first.
- Breakpoints in the test TypeScript rendered inside Monaco. That needs a debug
  adapter and code rewriting; the browser's own DevTools covers it instead.
- Top-level `await` in test files (a consequence of the CommonJS execution model).

## Context

`src/features/testbed/` exists but is empty, and `FileTypes.Test` is already in the
file-type enum with an icon, though nothing currently produces it. The simulator
feature already runs `smartc-signum-compiler` and `smartc-signum-simulator` in the
browser, so the engine underneath needs no work.

### Findings that shaped the design

Verified by spike, not assumed:

1. `signum-smartc-testbed@1.2.0` has **zero** Node imports and bundles clean for the
   browser target. `loadContract(code, options)` takes contract source, so the
   package itself never touches a filesystem.
2. Vite's `?raw` import suffix works in vitest with no configuration, including for
   `.smart.c` files. Binding contract source by import therefore costs ~5 lines in
   the runner and stays statically analyzable.
3. `@vitest/expect` + `chai` bundle for the browser (~300KB) and handle `bigint`
   correctly (`expect(1n).toBe(2n)` → `expected 1n to be 2n`, with `expected` and
   `actual` exposed for diffing). Matcher parity is real, not a subset.
4. Monaco is loaded from CDN with its full TypeScript worker, so in-browser
   transpilation and type-checking need no new dependency.
5. The testbed does **no** account pre-funding, and `sendTransactionAndGetResponse`
   mutates `tx.blockheight` in place before appending. Recording the transaction
   stream after those mutations captures a run exactly.

## Architecture

### Binding contract source

A test names its contract with a `?raw` import:

```ts
import ContractCode from "../counter.smart.c?raw";
```

The module registry resolves any specifier ending in `?raw` by stripping the query,
resolving the path against the project VFS, and returning the file text as the
default export. This replaces the filesystem entirely — there is no virtual `fs`, no
virtual `path`, and no bundler alias.

Beyond being small, it is **statically analyzable**: Studio knows which contract a
test targets by reading its imports, before executing anything. That drives the
test↔contract link in the file tree, gutter affordances, and the Debug button's
default target.

### Layout convention

Tests live in a `tests/` subfolder of the project, alongside helper modules — the
same organisation used with the testbed today:

```
counter.smart.c
tests/
  counter.test.ts
  context.ts          ← shared constants, accounts, method codes
  scenarios.ts        ← reusable TransactionObj[] fixtures
```

Helper modules need no special support: the registry already resolves relative
imports between project files.

### Modules (`src/features/testbed/`)

| Module | Responsibility |
| --- | --- |
| `transpile.ts` | Monaco TS worker → `{ js, sourceMap }` per `.ts` file, emitted as CommonJS |
| `runner/module-registry.ts` | `require` resolution over the VFS snapshot, including `?raw`; CommonJS eval with `//# sourceURL` |
| `runner/virtual-modules.ts` | Bare specifier → exports: `vitest`, `signum-smartc-testbed` |
| `runner/test-api.ts` | `describe/it/test`, `.only/.skip/.todo`, `beforeAll/beforeEach/afterEach/afterAll`; collect-then-run, emits events |
| `runner/expect.ts` | chai + `@vitest/expect` (`JestChaiExpect`, `JestExtend`, `JestAsymmetricMatchers`) |
| `runner/recording.ts` | Proxy over `SimulatorTestbed` capturing the contract and effective tx stream |
| `runner/worker.ts` | Worker entry: build registry, require entries, stream events |
| `runner-client.ts` | Main thread: transpile, spawn/terminate worker, watchdog, map stacks through sourcemaps |
| `to-debug-scenario.ts` | Recording → `ScenarioFile` for `DebugView` (test → debugger) |
| `generate-test.ts` | Debug session + pinned expectations → `.test.ts` source (debugger → test) |
| `emit-literals.ts` | BigInt/amount literal formatting shared by the generator |
| `test-starter.ts` | Starter template for a hand-created `.test.ts` |
| `typings/generated.ts` | Generated ambient `.d.ts` text for Monaco |
| `ui/` | Test editor, results panel, gutter decorations, failure detail, pin-expectations dialog |

### Execution model

Monaco's TypeScript worker transpiles each `.ts` file with `module: CommonJS` and
emits a sourcemap. Each module is evaluated as
`new Function("require", "exports", "module", code)` with `//# sourceURL=<vfs path>`
appended. Relative specifiers resolve against the project VFS; `?raw` specifiers
return file text; bare specifiers resolve to virtual modules.

The identical registry code runs in a Web Worker (the default) and on the main thread
(debug runs). That duality is what makes DevTools debugging nearly free.

**Alternatives considered.** `esbuild-wasm` would give a real bundler and top-level
`await`, at the cost of a ~10MB wasm payload and a second toolchain beside Monaco's
TypeScript. An ESM blob-URL module graph would give true ESM semantics but needs
fiddly specifier rewriting and degrades the DevTools story. Neither pays for itself.

### Run flow

1. The main thread snapshots the project from `FileSystem` (path → content) and
   transpiles every `.ts` in it. `.smart.c` files ride along as raw text for `?raw`
   imports.
2. It posts `{ modules, rawFiles, entryPaths, filter }` to the worker. BigInt
   survives structured clone, so results need no special encoding.
3. The worker requires each entry; `test-api` collects the suite tree, then runs it,
   posting `test:start` / `test:pass` / `test:fail` / `test:skip` / `run:done` events
   with durations.
4. **Timeouts are enforced by the main thread, not the worker.** A synchronous
   infinite loop in a contract blocks the worker's own timers, so only an outside
   watchdog can recover. The default budget is 5s per test, settable per run from the
   toolbar. On expiry the client terminates the worker and marks the test named by the
   most recent `test:start` as timed out.
5. Failures carry `message`, `expected`, `actual` and a stack. The client maps stack
   frames back to `.test.ts` line/column through the sourcemap.

## Authoring: debug session → test

This is the primary way tests get created, and the feature's main bet.

While debugging a contract, **Save session as test** opens a dialog listing candidate
assertions drawn from the current simulator state, grouped and pre-checked
heuristically (values that changed from their initial state are checked; unchanged
ones are listed but unchecked):

- named contract memory variables
- map entries (`k1`, `k2` → value)
- account balances
- transactions emitted by the contract

The user pins what matters and Studio writes a `tests/<contract>.test.ts` containing
the `?raw` import, the session's transactions as a `TransactionObj[]` literal, the
testbed setup, and one assertion per pinned value. `emit-literals.ts` formats amounts
in Signum's grouped form (`5000_0000n`) so generated code reads like hand-written
code.

The generated file is a normal test file from that point on — editable, re-runnable,
and no longer linked to the session that produced it.

## Debug handoff: test → debugger

The `signum-smartc-testbed` virtual module wraps the real class and records:

- `loadContract` — source, initializers, creator
- every transaction passed to `runScenario` and `sendTransactionAndGetResponse`,
  captured *after* the testbed mutates `blockheight`, so the stream is exact

`to-debug-scenario.ts` converts a recording into a `ScenarioFile`, and the Debug
button on a test result mounts the existing `DebugView` with `{ source, scenario }` —
giving breakpoints, memory inspector, ledger and ASM view with no new debugger code.

Two deltas to close:

- `ScenarioTx` gains an optional `messageHex`. The testbed's `asHexMessage` path is
  common and today's scenario format only carries `message` (text).
- The testbed never pre-funds accounts while `ScSimulatorEngine.submitScenario` does.
  The generated scenario funds each sender with its total outgoing amount plus
  1 SIGNA (`1_0000_0000` NQT) of headroom, so replay does not fail on negative
  balances.

The replay reproduces the **transaction stream, not the JS control flow** — assertions
do not re-evaluate while stepping. For debugging a contract, that is the intent.

A test may call `loadContract` more than once (the testbed supports multi-contract
setups, where the last-loaded contract is active). `DebugView` takes a single
`source`, so Debug opens the active contract and the panel notes that other loaded
contracts are present but not steppable.

## User interface

Opening a `.test.ts` file shows a Monaco TypeScript editor with a results panel
beside it, in a `react-resizable-panels` split matching the debug view's layout.

- **Toolbar:** Run, Stop, Re-run failed, and a Debug-run toggle (main thread +
  DevTools).
- **Gutter:** glyph-margin decorations per `it()` — pending / running / pass / fail —
  reusing the pattern in `use-debug-decorations.ts`, plus a click target to run that
  single test.
- **Results panel:** suite → test with durations. A failure shows its message, an
  expected/actual diff (bigint-aware), a stack frame that jumps to the mapped
  `.test.ts` line, and a **Debug** button. `console.log` output is forwarded as events
  and nested under the test that produced it.

### File-type wiring

`acceptedFileType()` accepts `.test.ts` → `FileTypes.Test`. The new-file dialog gains
a Test option, defaulting into the project's `tests/` folder, and `files-page.tsx`
routes `FileTypes.Test` to `TestFileEditor`. A hand-created test starts from
`test-starter.ts`:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { SimulatorTestbed } from "signum-smartc-testbed";
import ContractCode from "../counter.smart.c?raw";

describe("Counter", () => {
  let testbed: SimulatorTestbed;
  beforeEach(() => {
    testbed = new SimulatorTestbed(Scenario).loadContract(ContractCode).runScenario();
  });
});
```

### IntelliSense

`scripts/generate-test-typings.ts` concatenates the `.d.ts` files of
`signum-smartc-testbed` and `smartc-signum-simulator` from `node_modules`, strips
their relative import/export lines, wraps each in `declare module "…"`, appends the
`vitest` shim declarations and `declare module "*?raw"`, and writes
`typings/generated.ts`. Monaco loads these via `addExtraLib`; the project's other
`.ts` files are registered as models so relative imports typecheck.

This flattening is the fiddliest part of the design. If it proves unstable, the
fallback is a hand-authored facade `.d.ts` for the testbed surface, guarded by a test
that fails when the installed package version moves.

## Error handling

| Situation | Behaviour |
| --- | --- |
| TS syntax error | File reports a collection error; nothing runs |
| Unknown bare import | Error naming the specifier and listing what is injectable |
| `?raw` import of a missing file | Error naming the resolved VFS path and listing sibling `.smart.c` files |
| SmartC compile failure | Surfaces as the test failure, carrying the compiler's own message |
| Worker crash or timeout | Run marked errored; panel offers re-run |

## Testing strategy

Colocated `*.test.ts` files run by `bun test`, per repo convention:

- `module-registry` — relative resolution, `?raw` handling, circular-import guard
- `test-api` — collection order, `only`/`skip`, hook ordering, async tests, failure capture
- `generate-test` / `emit-literals` — generated source shape, bigint and amount formatting
- `to-debug-scenario` — recording → `ScenarioFile` including `messageHex` and funding
- **Integration:** pre-transpiled JS of a real contract test driven through the
  registry and test-api against the real `signum-smartc-testbed`. Runs in Bun without
  a browser and covers the whole runner core.

`transpile.ts` stays deliberately logic-free, since exercising it requires Monaco.

## Phases

1. Dependencies (`signum-smartc-testbed@^1.2.0`, `@vitest/expect`, `chai`), module
   registry with `?raw`, virtual modules; prove a contract loads and runs in the browser
2. Runner core: test-api, expect, collection and run events (+ bun tests, no UI)
3. Worker, client, main-thread watchdog, sourcemap stack mapping
4. File-type wiring, `tests/` folder default, starter template, Monaco TypeScript editor
5. Results panel, gutter decorations, failure navigation
6. Typings codegen (IntelliSense)
7. Session → test generator with pin-expectations dialog
8. Recording + `messageHex` on `ScenarioTx` + Debug handoff (test → debugger)
9. Main-thread debug run with `sourceURL` for DevTools
