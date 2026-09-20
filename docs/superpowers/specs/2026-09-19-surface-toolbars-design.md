# SmartC Studio — Where the Verbs Live

Status: approved 2026-09-19
Phase: 2C — ownership of actions, and the rail drawn at full strength. Keyboard
control (2B) is still pending and is unaffected: it maps onto the shape this
spec finishes.

## Goal

Studio has no single place where a surface's actions live. `Compile` is pushed
into the page header by the SmartC editor, `New Scenario` by the simulate page,
`Run` by the test editor — each through a global Jotai atom, each from a
`useEffect`, so the header's contents depend on which feature mounted last.
Meanwhile the control surface that gets pressed a hundred times a session — the
debugger's transport — is rendered at 18px inside a 30px strip, the smallest
chrome in the application.

This spec moves every verb to the surface it belongs to, gives all surfaces one
toolbar at one size with fixed slots, and redraws the workflow rail so it can
be read at a glance. The header is left with the two things that are true on
every page: **where you are**, and **how the contract stands**.

Nothing about routing, the file system, or the debug engine changes.

## Verified ground truth

Read out of the current code, not assumed:

- **Three strips do one job at three sizes.** `components/ui/editor/editor-toolbar.tsx:23`
  is a 30px strip used by four editors; `features/simulator/ui/debug-toolbar.tsx:32`
  is a second 30px strip with hand-rolled `<button className="px-2 py-0.5 border rounded">`;
  `features/simulator/ui/debug-view.tsx:62` is a third 30px strip holding only
  the scenario picker. The simulator therefore spends 60px on two strips.
- **The header is filled by remote control.** `stores/page-header-actions-atoms.ts`
  holds an array of actions; `hooks/use-page-header-actions.ts` exposes
  add/update/remove; `components/ui/page.tsx:68` renders whatever is in it.
  Three features write to it: `features/smartc-editor/smartc-editor.tsx:127`
  (Compile, with a second effect toggling `disabled` from validity),
  `pages/simulate/simulate-page.tsx:70` (New Scenario), and
  `features/testbed/ui/test-file-editor.tsx:218` (Run). Because they register in
  effects, the buttons appear one frame after the page does.
- **One consumer registers nothing at all.** `pages/files/files-page.tsx:22`
  reads `const {} = usePageHeaderActions();` — a no-op left behind.
- **The convention is written down and is the opposite of this spec.**
  `components/ui/editor/file-actions.tsx:4-10` states that page header actions
  "stay reserved for file-type specific commands (Compile, Debug, …)". That
  comment has to be rewritten, not silently contradicted.
- **The step vocabulary names two granularities almost the same.**
  `features/simulator/engine/simulator-engine.ts:70` — `step()` advances **one
  AT instruction**; `:76` — `stepInto()` calls `stepIntoSlotContract()` and
  advances **a source line**. The buttons for them read "Step (asm)" and
  "Step Into" (`debug-toolbar.tsx:36-40`).
- **The simulator explains itself only in an aside, and the aside is about to
  become wrong.** `debug-view.tsx:80` reads "— create one with 'New Scenario' on
  the contract". That action moves in this spec.
- **The rail is quiet by construction.** `features/workflow/rail.tsx:176`: cells
  are `min-w-[74px]`, the stage label is `text-[10px]` (`:183`) and the fact
  `text-[10.5px]` hidden below `lg` (`:189`). The loop is a 10px SVG under
  three of the four cells.
- **DevTools cannot be opened programmatically.** No browser API exposes it, and
  the repository already says so: `features/testbed/ui/devtools-help.tsx:22` —
  "Open DevTools first — it cannot attach to a run already underway." Any
  "Debug" verb that means the browser's debugger is therefore a request to the
  user, not an action.
- **An in-app debug verb already exists.** `test-file-editor.tsx:204-214`
  (`debugActiveTest`) re-runs one test and opens the step debugger on its
  recording.

## Decisions

### 1. The header carries identity and the rail. Nothing else.

`usePageHeaderActions`, `stores/page-header-actions-atoms.ts` and the actions
block in `PageHeader` are deleted, not replaced. Surfaces stop reaching into
the header; nothing arrives a frame late; nothing depends on mount order.

### 2. One toolbar, one size, fixed slots

`SurfaceToolbar` replaces `EditorToolbar` and `DebugToolbar`. Height **44px**,
and three slots that never move:

| Slot | Holds | Weight |
| --- | --- | --- |
| Left | the surface's verbs, primary first, groups divided by a hairline | primary: accent border, accent text, `color-mix(--accent-1 22%)` fill; secondary: `--border-2` outline |
| Middle | context — pickers, toggles, diagnostics, the `?` help | mono 11px for values, segmented control for view modes |
| Right | the readout, then window actions as icons | readout is **one** bordered field subdivided by hairlines, mono; `⧉`/`✕` are icon-only with tooltips |

Fixed positions are the point: what you learn in the simulator holds in the
editor. Size alone does not orient anyone.

File operations (Save, Download, Format) stay **icon-only on the right**. They
act on the open file, are identical everywhere and already carry hotkeys
(`EDITOR_HOTKEYS`); the left slot is reserved for what the surface is *for*.

### 3. What each surface owns

| Surface | Verbs (left) | Context (middle) | Right |
| --- | --- | --- | --- |
| SmartC editor | **Compile** (`Ctrl+Shift+C`) | compile diagnostic | file name · dirty · 💾 ⬇ |
| ASM editor | **Deploy** → `/projects/:id/deploy` | the hand-edit warning, assembler error | 💾 ⬇ |
| Scenario editor | — | JSON error | 💾 ⬇ ⌘Format |
| Testbed | **Run** · **Debug** (`debugActiveTest`) | "running…", the DevTools checkbox with its existing help popover | passed/failed · 💾 ⬇ |
| Simulator | **Continue** · **Step** ⟋ **Next block** ⟋ **Reset** | scenario picker · `+ New` · `source\|asm` · `?` | block/step/line/status · ⧉ ✕ |

Two surfaces have no verbs at all. The toolbar stays anyway, with an empty left
slot — the slots are a grid, not a suggestion.

`New Scenario` moves from the page header to the simulator's context, beside
the picker of scenarios, which is where its absence is noticed.

### 4. The rail becomes a track

The four boxes become four stops on a line, drawn as **one SVG** so the
geometry aligns by construction rather than by stacked CSS borders:

- Track: 2px, `--accent-2` at 50% opacity, through the three repeating stages.
- Stops: 12px diamonds (a square rotated 45°).
- **The diamond carries the fact's tone, not progress** — `--green` for a good
  fact, `--mag` for a bad one, an outline for "knows nothing yet". A filled
  diamond must never mean "done": `compileCell` and friends report a *fact*,
  and "Write is finished" is exactly the step-number claim the rail exists to
  avoid (see `2026-09-19-workflow-rail-design.md`).
- "You are here": a halo — `circle r=11` in `--accent-2` at 22% — plus the
  stage label in `--text` instead of `--dim`.
- The loop: **a flat bracket** beneath the three repeating stages, 2px in
  `--accent-2` at 85%, broken in the middle for a `↺`. The bracket sits low
  enough to leave the facts air — the arc is not allowed to crowd the type.
- The break before Deploy: a dashed 2px segment and an arrowhead. Deploy is
  outside the bracket, and fades to 40% while it is barred.
- Type: stage 11.5px Exo 2, fact 11px JetBrains Mono — up from 10px and 10.5px.
  The facts stay hidden below `lg`, as today: the track then shows stops and
  stage names only. Navigation must never break, only reporting.

Navigation, staleness and barring rules are unchanged; `rail-cells.ts` is not
touched.

### 5. The simulator's vocabulary is untangled

- "Step Into" becomes **Step** — the source-line step, the one usually wanted.
- "Step (asm)" becomes **Step instruction** and is shown **only in the asm
  view**, because it is that view's granularity. The confusing twin leaves the
  default state.
- **Next block** moves behind a divider: it advances the chain, not the
  contract.

### 6. The simulator explains itself

The name stays **Simulate**. The rail names stages of work, and the escalation
— does it compile, does it assert, does it behave in a world, ship it — breaks
if the third stage is named after a remedy. The debugger is the instrument
inside the stage; internal identifiers (`DebugView`, `DebugController`, …) keep
their names.

What was missing is the model, in two places:

- **The empty state becomes an invitation** (replacing `debug-view.tsx:80`):
  *Your contract runs here in an invented Signum chain. A scenario supplies the
  transactions that poke it. Blocks only exist when you forge them. Set
  breakpoints in the margin — Step advances one source line.* Below it, the
  button that creates the first scenario.
- **A `?` in the context slot** keeps those four sentences reachable once the
  empty state is gone, reusing the popover idiom of `devtools-help.tsx`.

## Components and files

New:

- `components/ui/surface-toolbar.tsx` — the toolbar, its slots, and the button
  weights (`primary` / `secondary` / `icon`).
- `features/simulator/ui/simulator-help.tsx` — the four sentences, shared by the
  empty state and the `?` popover.

Rewritten:

- `features/workflow/rail.tsx` — one SVG; cells become stops.
- `features/simulator/ui/debug-toolbar.tsx` → a `SurfaceToolbar` composition.
- `features/simulator/ui/debug-view.tsx` — the scenario strip folds into the
  toolbar's context slot; two strips become one.
- `features/smartc-editor/smartc-editor.tsx`, `asm-code-editor.tsx`,
  `scenario-editor.tsx`, `test-file-editor.tsx` — own their verbs.
- `components/ui/editor/file-actions.tsx` — the doc comment now states the new
  rule.

Deleted:

- `stores/page-header-actions-atoms.ts`
- `hooks/use-page-header-actions.ts`
- the actions block in `components/ui/page.tsx`
- `components/ui/editor/editor-toolbar.tsx` (absorbed by `SurfaceToolbar`)
- the no-op call in `pages/files/files-page.tsx:22`

## Testing

Most of this is view code, and saying otherwise would be dishonest. What is
worth a test, gets one:

- `railMark(tone, here)` — the tone-to-diamond mapping, including that a good
  fact and "you are here" are independent, and that no combination yields a
  filled diamond for an unknown fact.
- `rail-cells.test.ts` stays as-is and must keep passing: this spec changes how
  facts are drawn, never how they are decided.
- A guard test that no module imports `use-page-header-actions` — the deletion
  is only complete when nothing reaches for it again.

Everything else is verified by `bun test` (587 green today), `bun run build`,
and walking the five surfaces: each one's verbs present, in the left slot, at
44px, with the readout right.

## Deferred

- The deploy page keeps its own chrome; it adopts `SurfaceToolbar` later.
- `⧉ Pop out` and `/debug/dashboard` are untouched.
- The testbed's "Debug run (DevTools)" checkbox stays a context option — it
  means the browser's debugger, which the page cannot open.

## Risks

- **A half-migration is worse than none.** Four editors share `EditorToolbar`;
  until all four move, Studio shows two idioms at once. The migration is one
  change, not four.
- **Compile's disabled state is currently expressed remotely**
  (`smartc-editor.tsx:140-143` pushes `{ disabled: !isValid }` into the atom).
  It becomes a local prop; the behaviour — a contract with errors cannot be
  compiled from the button — must survive.
- The rail's SVG must stay legible in all four climates; `--accent-2` differs
  sharply between nexus, solaris, terminal and dawn, and the bracket is drawn in
  it at 85%.
