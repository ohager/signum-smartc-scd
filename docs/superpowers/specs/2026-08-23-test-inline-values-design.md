# Inline Values and Single-Test Runs

**Date:** 2026-08-23
**Status:** Approved, ready for planning
**Follows:** `2026-08-22-browser-test-runner-design.md` (Plans 1–3)

## Goal

Make a failing contract test explain itself without leaving Studio. After a run,
each line shows the values it produced; a play button in the gutter re-runs one
test on its own; and the step debugger targets a single test rather than a whole
file's concatenated transaction stream.

This deliberately stops short of a JavaScript breakpoint debugger. The reasoning
is in "Why not breakpoints" below.

## Background

Plan 3 delivered failure-to-line navigation: a thrown `AssertionError` resolves
through sourcemaps to the line that threw, the results panel jumps there, and
gutter dots show per-test status. What it cannot tell you is *how* a value got
wrong — only that it is wrong at a particular line.

It also left a known limitation. Recordings are captured per file, so a file
whose `beforeEach` builds a fresh testbed records every test's transactions
concatenated together. The Debug button therefore replays "this file's run",
which is rarely what you want.

Both gaps close with the same piece of machinery: a way to observe what user
code did, per test.

## Why not breakpoints

The obvious answer to "I want to inspect variables" is a breakpoint debugger,
and it was considered seriously. Two findings pushed against it.

**The DevTools protocol is unreachable from a web page.** The Chrome DevTools
Protocol is exposed to browser extensions holding the `debugger` permission, to
processes attached via `--remote-debugging-port`, and to Node/Electron hosts
through the `inspector` module. There is no web-standard surface, permission
prompt or otherwise, and Chrome deliberately blocks pages from reaching the
debugging port. Driving DevTools from inside Studio while keeping the UI in
Studio is therefore not possible for a web application. It would become possible
if Studio ever ships as a Tauri or Electron desktop build, at which point this
decision is worth revisiting.

**Building a real debugger is possible but disproportionate.** Tests already run
in a Web Worker, so the hard part — pausing synchronous JavaScript without
making every function `async` — has a clean solution: instrument each statement
with a synchronous check, and block the worker thread on `Atomics.wait` while
the main thread drives the UI. This works, requires no DevTools, and keeps the
interface responsive. It also requires cross-origin isolation (COOP/COEP
headers, currently unset in `apps/studio/vercel.json`), a scope-capture
transform, and a full pause/step/inspect interface.

For test code specifically, the payoff is questionable. A contract test runs in
milliseconds and can be re-run instantly. Seeing every value at once beats
pausing at one frame and poking around. So: inline values now, breakpoints only
if inline values prove insufficient. The instrumentation layer specified here is
the same layer a breakpoint debugger would need, so nothing is wasted if that
judgement turns out to be wrong.

The main-thread DevTools escape hatch built in Plan 3 stays, and this spec
improves it (see "DevTools fallback").

## What the user sees

### Inline values

After a run, annotations appear at the end of lines in the editor. Two kinds:

```
it("counts up", () => {
  const tb = new SimulatorTestbed()
    .loadContract(Code);              │ tb = SimulatorTestbed {}

  tb.runScenario(txs);

  const counter =
    tb.getContractMemory("counter");  │ counter = 2n

  expect(counter).toBe(2n);           │ ✓ 2n
  expect(tb.getMap(1n, 10n))
    .toBe(1n);                        │ ✗ got 0n, want 1n
});
```

A value is shown when a variable is **declared or reassigned**, and a pass/fail
marker is shown on each **assertion**. Statements that produce nothing
interesting — fluent builder calls returning `this`, void returns — are not
annotated. This density was chosen over annotating every expression because
contract tests are full of chained builder calls whose value is always the
builder itself.

### Repeated lines

A line inside a loop shows its **last** value with a count badge. Hovering lists
the individual values in order:

```
for (const tx of txs) {
  const r = send(tx);   │ r = 3n  ×4
}

hover:  1: 1n   2: 2n   3: 2n   4: 3n
```

The last value is shown rather than the first because loop bugs almost always
surface in a later iteration.

### Which test's values

A file run captures a separate value trace for **every** test in the file. The
editor renders the trace of the **active test**, which is:

- set when the cursor moves inside an `it()` in a test file, or
- set by clicking a row in the results panel, and
- **persists across file navigation**

That last property is the important one. A helper in `tests/helpers/context.ts`
may be called by five different tests, so a line in it produced five different
values. Deriving the active test from cursor position alone gives no answer
there, because the helper contains no `it()` at all. Persisting the active test
means you can park on the failing test, open the helper, and see exactly what
that test saw going through it.

Because misreading values as belonging to a different execution is this
feature's main failure mode, the UI always states which test it is showing: the
active row is highlighted in the results panel, and a file containing no tests
shows a header line reading `showing values from: Counter › counts up`.

### Play buttons

Each `it()` gets a play button in the glyph margin, hover-swapped with the Plan 3
status dot — the margin is one column wide, so the dot shows normally and
becomes a play triangle when the line is hovered. This follows the pattern
already used for breakpoint toggling in `debug-view.tsx`, which handles
`editor.onMouseDown` against `MouseTargetType.GUTTER_GLYPH_MARGIN`.

Clicking runs that test alone. Values are *not* gated on this — a plain file run
annotates everything. The play button is a speed and focus tool, not the price
of admission.

### Debug this test

The Debug button becomes per-test. It triggers a filtered run of the active
test, then opens the existing step debugger on the resulting recording. Because
the run executed exactly one test, the recording contains exactly that test's
transactions, closing the Plan 3 limitation without any per-test recorder
plumbing.

## Architecture

### Instrumentation: line-preserving, no sourcemap composition

Instrumentation targets the **JavaScript Monaco emits**, not the TypeScript
source. Rewriting the TypeScript would be conceptually cleaner but needs a
TypeScript parser in the page, and Monaco's TS worker exposes no general
transform API; bundling `typescript` for this buys nothing.

The rewrite obeys one hard rule: **an instrumented file has exactly the same
number of lines as its input.** Every insert is a single-line snippet. Two
consequences follow, and together they remove an entire subsystem:

1. The existing TS→JS sourcemap stays valid for line resolution, so Plan 3's
   failure-to-line feature keeps working untouched. Columns drift within a line,
   but every mapping segment on a given generated line resolves to the same
   original line, so line lookups are unaffected.

2. Line numbers are **baked in at instrument time**. When rewriting generated
   line 42, the existing map (via `@jridgewell/trace-mapping`, already a
   dependency) resolves it to TypeScript line 17, and the emitted call carries
   `17` literally. No runtime mapping, no composed sourcemap, nothing to keep in
   sync.

The alternative — a full second sourcemap composed with the first via
`@jridgewell/remapping` — is correct in more generality but adds a dependency
and a fiddly composition step for no benefit here.

The line-count rule also yields a testable invariant that catches a whole class
of bug in one assertion: `instrument(js)` has the same line count as `js`.

### The rewrite

Three cases, all single-line inserts:

```js
// Declaration: wrap the initialiser.
const counter = tb.getMemory("counter");
const counter = __v(17,"counter", tb.getMemory("counter"));

// Reassignment: wrap the assigned expression.
total = total + n;
total = __v(23,"total", total + n);

// Assertion: a bare marker after the statement.
expect(counter).toBe(2n);
expect(counter).toBe(2n); __ok(25);
```

The assertion case is deliberately minimal. Wrapping `expect(...)` in an arrow
and a try/catch would work but is heavier and changes evaluation semantics. A
bare marker placed *after* the statement gives the same information: if the
assertion throws, the marker never runs, so the line is not marked passing. The
failing side comes free from data already collected — Plan 3 resolves the
thrown `AssertionError` to its line.

`__v` and `__ok` are injected into the module registry alongside `require`,
`exports` and `module`, so no import resolution is involved.

Only **user project files** are instrumented, and this is structural rather than
a rule to enforce. `RunRequest.modules` is populated solely by `snapshotProject`
walking the project folder, while `signum-smartc-testbed` reaches the registry as
a *virtual* module. Instrumenting `request.modules` therefore cannot touch
`node_modules`, so the testbed and simulator run at full speed and no code we do
not control is rewritten.

Instrumentation is **always on**, with no toggle. A `__v` call per binding is
negligible next to the simulator executing contract bytecode, and a toggle is a
setting that would be wrong half the time. Adding one later is trivial if this
proves wrong.

### Value capture

`__v` **serialises immediately** and keeps only the resulting string. This is a
correctness requirement, not an optimisation. Holding a reference to a
`SimulatorTestbed` and formatting it at render time would display its *final*
state rather than its state at that line — precisely the lie this feature exists
to prevent. It also stops traces from pinning live contract state in memory.

Caps:

| Scope | Limit | Behaviour past the limit |
|---|---|---|
| Per line | last 100 values, plus a total count | Ring buffer, so the displayed value is always the true last; hover says `showing last 100 of 3000` |
| Per test | 20,000 entries | Capture stops; the trace is flagged truncated and the UI says so |
| Per value | depth 3, 200 characters | Elided with `…`; cycles render `[Circular]`; a throwing getter renders `<throws>` |

These numbers are estimates. A suite looping over hundreds of transactions will
reach them sooner than assumed, and they are expected to be tuned once the
feature is used against a real suite.

### Test discovery: static, refined by runs

Play buttons must appear before anything has run. Two options were considered: a
collect-only runner mode that executes module top level and `describe` bodies,
or a static parse.

Static parsing wins because acorn is already being added for instrumentation, so
the scan is nearly free — and critically, it **executes nothing**. A collect-only
mode would run real module-level code every time a file is opened or saved,
which is a side effect nobody asked for.

The scan finds `it`/`test`/`describe` calls and their nesting, handling
`.only`/`.skip`/`.todo`, and yields `{ name, path[], line }`. It runs debounced
on edit. Its one blind spot is a computed test name:

```js
for (const c of cases) it(`case ${c}`, ...)   // not found statically
```

This is accepted. After any real run, the true collected plan from the existing
`run:plan` event replaces the static guess, so dynamically generated tests get
their buttons and dots as soon as the file has been run once.

### Single-test filter

`RunRequest` gains `filter?: string[]`, a test name path such as
`["Counter", "counts up"]`.

**Name path, not test id.** Ids are `` `${file}#${nextId++}` `` (test-api.ts:62),
a collection-order counter: inserting a test shifts every id below it. A name
path is stable across edits. Duplicate names within a suite are the one edge
case; first match wins, which is what other runners do.

The filter rides on the existing `.only` machinery rather than introducing a
parallel path. In `test-api.ts`, `onlyMode` becomes
`hasOnly(root) || filter !== undefined`, and the `isSuiteSkipped` /
`isTestSkipped` predicates gain a filter clause. This matters for correctness:
`.only` semantics already guarantee that `beforeAll`/`beforeEach` of enclosing
suites still run, which is exactly what a single-test run needs, since that is
where the testbed gets built. A filter written from scratch would have to
re-derive that behaviour.

### State ownership

Traces live in a **jotai atom above the editor component**, not in
`TestFileEditor`. You run a test file, then navigate to a helper to see what that
test saw going through it — by which point `TestFileEditor` has unmounted and
remounted for a different file. Since a trace is keyed by `(file, line)` across
every file the run touched, the helper's values are already present. The atom
holds the traces, the active test, and a file→lines index; every editor reads
from it. The codebase already uses jotai.

### DevTools fallback

The Plan 3 main-thread run toggle stays, as an escape hatch for developers who
want a real stepping debugger. This spec improves it in two ways.

**Inline sourcemaps.** The module registry currently appends `//# sourceURL=`
but no `sourceMappingURL`, so DevTools shows raw emitted JavaScript. Once
instrumentation lands, that view fills with `__v(...)` calls — the fallback
degrades exactly when someone reaches for it. Appending an inline
`//# sourceMappingURL=data:application/json;base64,…` built from the sourcemap
already produced makes DevTools display the original TypeScript, so breakpoints
land on real source lines and instrumentation becomes invisible.

**In-app guidance.** A help popover on the toggle explains the order of
operations, which is not guessable: DevTools must be open *before* the run
starts; the file appears in Sources under its real project path; either a
`debugger;` statement or a Sources breakpoint works; and a runaway contract
freezes the tab, because the watchdog cannot interrupt the loop that is blocking
it.

## File structure

New:

| Path | Responsibility |
|---|---|
| `src/features/testbed/instrument/instrument.ts` | Line-preserving rewrite. `instrument(js, sourceMap, path) → js` |
| `src/features/testbed/instrument/find-tests.ts` | Static acorn scan → `{ name, path[], line }[]` |
| `src/features/testbed/instrument/serialize-value.ts` | One value → a capped display string |
| `src/features/testbed/runner/trace.ts` | `__v`/`__ok` sinks, caps, builds a `TestTrace` |
| `src/features/testbed/test-trace-store.ts` | Jotai atom: traces, active test, file→lines index |
| `src/features/testbed/ui/use-value-decorations.ts` | Renders a trace as Monaco inline decorations |
| `src/features/testbed/ui/use-test-actions.ts` | Gutter play buttons, hover-swapped with status dots |
| `src/features/testbed/ui/devtools-help.tsx` | The DevTools guidance popover |

Modified:

- `runner/types.ts` — `RunRequest.filter`; `test:end` carries `trace`
- `runner/test-api.ts` — filter clause in the only-predicates
- `runner/run-request.ts` — inject `__v`/`__ok`; instrument before evaluating
- `runner/module-registry.ts` — append inline `sourceMappingURL`
- `use-test-run.ts` — pass a filter through
- `ui/test-file-editor.tsx`, `ui/test-results-panel.tsx` — active test, per-test Debug

New dependencies: `acorn`, `magic-string`. (`@jridgewell/trace-mapping` is
already present; `@jridgewell/remapping` is deliberately *not* needed.)

**One consolidation.** Bigint-aware formatting is currently duplicated in
`test-results-panel.tsx` (`formatValue`) and `run-request.ts` (`formatArg`).
`serialize-value.ts` replaces both — one implementation, three call sites.

## Error handling

**Instrumentation never breaks a run.** If acorn fails to parse emitted
JavaScript, that module is evaluated uninstrumented, a warning event is emitted,
and the run proceeds. Tests passing is the product; inline values are a nicety
layered on top, and a bug in the nicety must not cost the product.

**A failed static scan leaves the previous result standing.** While a file is
mid-keystroke and does not parse, existing play buttons stay put rather than
flickering away.

**Serialisation is total.** A throwing getter, a cyclic structure, or a proxy
that misbehaves yields a placeholder string, never an exception that would
propagate into user code.

**Cap breaches are stated, not swallowed.** A truncated trace says so in the UI.

## Testing

Everything holding a decision is a pure function with table-driven tests:

- `instrument.ts` — declarations, reassignment, destructuring, `for…of`, class
  fields, nested scopes, and the **line-count invariant asserted on every case**
- `find-tests.ts` — nesting, `it`/`test` aliases, `.only`/`.skip`/`.todo`,
  computed names correctly ignored
- `serialize-value.ts` — bigint, cycles, depth cap, length cap, throwing getters
- `trace.ts` — ring buffer behaviour, both caps, truncation flags
- `test-api.ts` — the filter extends the existing suite; hooks must still run
- One integration test runs a real contract under a filter and asserts trace
  contents

The two Monaco hooks stay deliberately logic-free, following the precedent set
by `transpile.ts`: code that cannot be tested outside a browser holds no
decisions.

## Out of scope

- Breakpoints, pause/resume, `Atomics`, COOP/COEP headers
- Per-test recordings via a per-test recorder (obsoleted by the filter)
- Run-all-files across a project
- Generating tests from a debug session
- Generated `.d.ts` from installed packages, replacing the hand-written facade
