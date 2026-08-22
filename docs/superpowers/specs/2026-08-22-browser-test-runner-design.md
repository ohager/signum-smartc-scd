# Browser Test Runner for SmartC Studio

**Date:** 2026-08-22
**Status:** Approved design

## Goal

Let a Studio user write and run unit tests for SmartC contracts entirely in the
browser, using the existing [`signum-smartc-testbed`](https://github.com/ohager/signum-smartc-testbed)
package, and debug the contract under test in Studio's existing step debugger.

A test file written in Studio is a **valid vitest test file**. It can be exported
into a real repository and run with `vitest run` unchanged, and a test from such a
repository can be pasted into Studio and run as-is. That constraint drives most of
the decisions below.

## Non-goals

- A project-wide "Tests" page with a run-all-files button. The per-file loop comes
  first; cross-file running waits until that loop feels right.
- Breakpoints in the test TypeScript rendered inside Monaco. That needs a debug
  adapter and code rewriting; the browser's own DevTools covers it instead (see
  "Debug run").
- Top-level `await` in test files (a consequence of the CommonJS execution model).

## Context

`src/features/testbed/` exists but is empty, and `FileTypes.Test` is already in the
file-type enum with an icon, though nothing currently produces it. The simulator
feature already runs `smartc-signum-compiler` and `smartc-signum-simulator` in the
browser, so the underlying engine is proven; what is missing is the test-authoring
and test-execution layer around it.

### Findings that shaped the design

These were verified by spike, not assumed:

1. `signum-smartc-testbed@1.1.0` has exactly **one** Node dependency: `readFileSync`
   in `loadContract(codePath)`. Everything else is browser-safe.
2. Bun's browser target silently stubs `fs` as `{}` — the build stays green and
   `readFileSync` is `undefined` at runtime. A real shim is required, and its
   absence would fail late and confusingly.
3. A Bun plugin resolving `fs` to a custom module works in **both** the dev server
   (`bunfig.toml` `[serve.static] plugins`, relative path accepted) and production
   (`Bun.build({ plugins })`). Verified by inspecting both emitted bundles.
4. `@vitest/expect` + `chai` bundle for the browser (~300KB) and handle `bigint`
   correctly (`expect(1n).toBe(2n)` → `expected 1n to be 2n`, with `expected` and
   `actual` exposed for diffing). Matcher parity is therefore real, not a subset.
5. Monaco is loaded from CDN with its full TypeScript worker, so in-browser
   transpilation and type-checking need no new dependency.
6. The testbed does **no** account pre-funding, and `sendTransactionAndGetResponse`
   mutates `tx.blockheight` in place before appending. Recording the transaction
   stream after those mutations captures the run exactly.

## Architecture

### The bundler seam

`src/lib/browser-fs/` contains:

- `index.ts` — `readFileSync` / `existsSync` over an in-memory `Map<path, content>`,
  plus the registration function the runner calls before a run.
- `plugin.ts` — a `BunPlugin` whose `onResolve({ filter: /^(node:)?fs$/ })` points at
  `index.ts`.

Registered in `bunfig.toml` for dev and in `build.ts` for production builds. This
seam is the single reason `loadContract("./counter.smart.c")` runs unchanged in the
browser; both files carry a comment saying so, because the connection is otherwise
invisible to a reader.

The shim's registry is a module singleton, so the worker and the main thread each
hold their own instance. The runner populates it from the posted VFS snapshot before
executing any module.

### Modules (`src/features/testbed/`)

| Module | Responsibility |
| --- | --- |
| `transpile.ts` | Monaco TS worker → `{ js, sourceMap }` per `.ts` file, emitted as CommonJS |
| `runner/module-registry.ts` | `require` resolution over the VFS snapshot; CommonJS eval with `//# sourceURL` |
| `runner/virtual-modules.ts` | Bare specifier → exports: `vitest`, `signum-smartc-testbed`, `path`, `fs` |
| `runner/test-api.ts` | `describe/it/test`, `.only/.skip/.todo`, `beforeAll/beforeEach/afterEach/afterAll`; collect-then-run, emits events |
| `runner/expect.ts` | chai + `@vitest/expect` (`JestChaiExpect`, `JestExtend`, `JestAsymmetricMatchers`) |
| `runner/recording.ts` | Proxy over `SimulatorTestbed` capturing the contract and the effective tx stream |
| `runner/worker.ts` | Worker entry: build registry, require entries, stream events |
| `runner-client.ts` | Main thread: transpile, spawn/terminate worker, watchdog, map stacks through sourcemaps |
| `to-debug-scenario.ts` | Recording → `ScenarioFile` for `DebugView` |
| `test-starter.ts` | Starter template for a new `.test.ts` file |
| `typings/generated.ts` | Generated ambient `.d.ts` text for Monaco |
| `ui/` | Test editor, results panel, gutter decorations, failure detail |

### Execution model

Monaco's TypeScript worker transpiles each `.ts` file with `module: CommonJS` and
emits a sourcemap. Each module is evaluated as
`new Function("require", "exports", "module", "__dirname", "__filename", code)` with
`//# sourceURL=<vfs path>` appended. Relative specifiers resolve against the project
VFS — so `./context.ts` and `./test.scenarios.ts` work exactly as they do in a repo —
and bare specifiers resolve to injected virtual modules.

The identical registry code runs in a Web Worker (the default) and on the main thread
(debug runs). That duality is what makes DevTools debugging nearly free.

**Alternatives considered.** `esbuild-wasm` would give a real bundler and top-level
`await`, at the cost of a ~10MB wasm payload and a second toolchain beside Monaco's
TypeScript. An ESM blob-URL module graph would give true ESM semantics but needs
fiddly specifier rewriting and degrades the DevTools story. Neither pays for itself
here.

### Run flow

1. The main thread snapshots the project from `FileSystem` (path → content) and
   transpiles every `.ts` in it — test files plus helpers. `.smart.c` files ride
   along as raw text for the `fs` shim.
2. It posts `{ modules, rawFiles, entryPaths, filter }` to the worker. BigInt
   survives structured clone, so results need no special encoding.
3. The worker requires each entry; `test-api` collects the suite tree, then runs it,
   posting `test:start` / `test:pass` / `test:fail` / `test:skip` / `run:done` events
   with durations.
4. **Timeouts are enforced by the main thread, not the worker.** A synchronous
   infinite loop in a contract blocks the worker's own timers, so only an outside
   watchdog can recover. On expiry the client terminates the worker and marks the
   test named by the most recent `test:start` as timed out.
5. Failures carry `message`, `expected`, `actual` and a stack. The client maps stack
   frames back to `.test.ts` line/column through the sourcemap.

### Debug handoff

The `signum-smartc-testbed` virtual module wraps the real class and records:

- `loadContract` — path, resolved source, initializers, creator
- every transaction passed to `runScenario` and `sendTransactionAndGetResponse`,
  captured *after* the testbed mutates `blockheight`, so the stream is exact

`to-debug-scenario.ts` converts a recording into a `ScenarioFile`, and the Debug
button on a test result mounts the existing `DebugView` with `{ source, scenario }` —
giving breakpoints, memory inspector, ledger and ASM view with no new debugger code.

Two deltas to close:

- `ScenarioTx` gains an optional `messageHex`. The testbed's `asHexMessage` path is
  common and today's scenario format only carries `message` (text).
- The testbed never pre-funds accounts while `ScSimulatorEngine.submitScenario` does.
  The generated scenario funds each sender with its total outgoing amount plus a
  margin, so replay does not fail on negative balances.

The replay reproduces the **transaction stream, not the JS control flow** — assertions
do not re-evaluate while stepping. For debugging a contract, that is the intent.

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
  `.test.ts` line, and a **Debug** button when a recording exists. `console.log`
  output is forwarded as events and nested under the test that produced it.

### File-type wiring

`acceptedFileType()` accepts `.test.ts` → `FileTypes.Test`. The new-file dialog gains
a Test option. `test-starter.ts` generates a starter bound to a contract in the same
folder, mirroring how `smartcStarter` works:

```ts
import { describe, it, expect, beforeEach } from "vitest";
import { SimulatorTestbed } from "signum-smartc-testbed";
import { join } from "path";

const ContractPath = join(__dirname, "./counter.smart.c");
```

`files-page.tsx` routes `FileTypes.Test` to `TestFileEditor`.

### IntelliSense

`scripts/generate-test-typings.ts` concatenates the `.d.ts` files of
`signum-smartc-testbed` and `smartc-signum-simulator` from `node_modules`, strips
their relative import/export lines, wraps each in `declare module "…"`, appends the
`vitest` shim declarations, and writes `typings/generated.ts`. Monaco loads these via
`addExtraLib`; the project's other `.ts` files are registered as models so relative
imports typecheck.

This flattening is the fiddliest part of the design. If it proves unstable, the
fallback is a hand-authored facade `.d.ts` for the testbed surface, guarded by a test
that fails when the installed package version moves.

## Error handling

Each failure mode gets a message that names the thing that went wrong:

| Situation | Behaviour |
| --- | --- |
| TS syntax error | File reports a collection error; nothing runs |
| Unknown bare import | Error naming the specifier and listing what is injectable |
| `loadContract` on a missing path | ENOENT naming the **resolved VFS path**, listing sibling `.smart.c` files |
| SmartC compile failure | Surfaces as the test failure, carrying the compiler's own message |
| Worker crash or timeout | Run marked errored; panel offers re-run |

## Testing strategy

Colocated `*.test.ts` files run by `bun test`, per repo convention:

- `module-registry` — relative resolution, circular-import guard, `sourceURL`
- `test-api` — collection order, `only`/`skip`, hook ordering, async tests, failure capture
- `to-debug-scenario` — recording → `ScenarioFile` including `messageHex` and funding
- `browser-fs` — register / read / ENOENT
- **Integration:** pre-transpiled JS of a real contract test driven through the
  registry and test-api against the real `signum-smartc-testbed`. This runs in Bun
  without a browser and covers the whole runner core.

`transpile.ts` stays deliberately logic-free, since exercising it requires Monaco.

## Phases

1. Bundler seam + `browser-fs` + dependencies (`signum-smartc-testbed`,
   `@vitest/expect`, `chai`); prove `loadContract` works in the browser
2. Runner core: registry, virtual modules, test-api, expect (+ bun tests, no UI)
3. Worker, client, main-thread watchdog, sourcemap stack mapping
4. File-type wiring, starter template, Monaco TypeScript editor
5. Results panel, gutter decorations, failure navigation
6. Typings codegen (IntelliSense)
7. Recording + `messageHex` on `ScenarioTx` + Debug handoff
8. Main-thread debug run with `sourceURL` for DevTools
