# SmartC Studio — The Workflow Rail

Status: approved 2026-09-19
Phase: 2A — layout and UX of the working surfaces. Keyboard control is 2B and
follows this, deliberately, so that it maps onto the finished shape.

## Goal

Studio's four workflow surfaces are inconsistent in a way that has nothing to
do with how they look. Two of them — the test file and the assembler — are file
types you open. The other two — debugging and deployment — are hidden states
you enter and must find your way out of. Debugging swaps the entire editor for
itself; deployment hides in the third tab of the assembler, attached to a
generated file that the next compile overwrites.

This spec turns all four into **equal destinations belonging to the contract**,
announced by one rail that also reports how the contract stands. The rail is
the only place where the tool says, of its own accord, that there is more to do
after writing.

It does not introduce editor tabs or split views: one thing at a time stays.

## Verified ground truth

Read out of the current code, not assumed:

- **Three panel idioms for one job.** `asm-editor.tsx:50` uses shadcn `Tabs`
  with a `?v=` URL parameter; `test-file-editor.tsx` uses
  `ResizablePanelGroup`; `debug-view.tsx:241-275` hand-rolls a flex row with
  the panel width in React state and its own drag handle.
- **Four copies of the same height workaround.** `smartc-editor.tsx`,
  `asm-code-editor.tsx`, `scenario-editor.tsx` and `test-file-editor.tsx` each
  measure `getBoundingClientRect().top` and size themselves with
  `calc(100vh - …)`, because `PageContent` (`components/ui/page.tsx:92`) is a
  plain block `div` in which `h-full` cannot resolve.
- **Debugging is a boolean.** `smartc-editor.tsx` holds `isDebugging`; when
  true it returns `<DebugView>` instead of the editor, so the page header, the
  file actions and the save path all disappear. The debug *dashboard*, however,
  is already a route (`/debug/dashboard`).
- **Deployment hangs off the assembly file.** `deployment-view/` renders inside
  the ASM editor's third tab, disabled until the assembly is valid.
- **The code hash is already computed locally.** `tryAssemble` yields
  `MachineData.MachineCodeHashId`, displayed today at
  `asm-editor/meta-data-view/contract-meta-data.tsx:90`.
- **The chain can be asked about it.** `@signumjs/core@3.2.0` exposes
  `getAllContractsByCodeHash({ machineCodeHash, includeDetails?, firstIndex?,
  lastIndex? })`, returning `ContractList { ats: Contract[] }` — with **no
  total count**. `Contract` (`@signumjs/contracts@3.3.4`) carries `creator`,
  `creatorRS`, `at`, `atRS`, `machineCodeHashId`, `creationBlock` and the
  liveness flags `running`, `stopped`, `frozen`, `finished`, `dead`.
- **A persisted-service pattern already exists.** `RecentFiles`
  (`lib/file-system/recent-files.ts`) is a small record inside the file
  system's metadata blob, composed into `FileSystem` as `fs.recents`,
  synchronous to read, and — since 2026-09-18 — synchronised across tabs.
- **A main-contract rule exists but is not the one the rail needs.**
  `pickMainFile` (`features/home/project-summary.ts:86`) takes the *newest*
  contract and, finding none, falls back to the newest file of any type,
  because the project card must open something. A rail must not invent a
  subject, and its answer must not flicker between renders. Two rules, one
  shared suffix predicate.
- **The route's `:projectId` is not reliably a project.** `files-page.tsx:75`
  rewrites the URL to the opened file's *immediate* parent folder, so a
  contract in `src/` puts `src` there. `use-recent-files.ts:32-35` documents
  the same trap and resolves it through `findFolderChainToFile`.
- **`FileSystem` is not reactive and `listFilesRecursive` throws.** Readers
  subscribe to `file:*` / `folder:*` / `fs:reloaded` (as `use-recent-files.ts`
  does) or they see a frozen snapshot; and an unknown folder id raises
  (`file-system.ts:818`) rather than answering empty.
- **Two dead components**, `components/ui/layout/main-area.tsx` and
  `right-sidebar.tsx`, are imported nowhere.
- `NewProjectDialog` offers a second project type, `inspect`, which today only
  creates an empty folder. The inspector is a separate, outstanding
  sub-project.

## Decisions

1. **One contract per project.** One `.smart.c`, therefore one `.asm`, and any
   number of tests and scenarios. The rail asks the project for its contract
   rather than deriving one from file-name families or asking the user.
2. **The rail reports state, not position.** Four cells, each carrying a fact
   about the contract — not a step number. This is what stops it reading as a
   pipeline, which the process is not.
3. **A loop arc under the first three.** Write, Test and Simulate repeat;
   Deploy happens once and costs money. A 1px arc drawn back from Simulate to
   Write says so; a gap and an arrow separate Deploy.
4. **Four destinations, two of them new routes.** Simulate and Deploy stop
   being states.
5. **Deployment status is derived from the chain, never stored.** The code hash
   is a pure function of the compiled code, so the question is answerable from
   source plus node — surviving a reload, another browser, and a fresh import
   on another machine.
6. **Only two facts are persisted**, the last compile verdict and the last test
   result, and both carry the `lastModified` of the source they came from. A
   green badge from before the last edit is worse than no badge.
7. **One panel idiom**, `ResizablePanelGroup`, everywhere.
8. **Nothing nags.** Cells that cannot answer say so quietly. No blinking, no
   warning colour for "not yet".

## The rail

It sits in the page header, to the right of the file name, 52px tall. Four
cells, each two lines: a label and a fact.

It appears on the project routes only — the file, Simulate and Deploy
destinations. The home page has no contract to report on and keeps its own
`how-it-works` strip, which is where this narrative came from.

| Cell | Fact | Source |
|---|---|---|
| **Write** | `compiles` / `1 error` / `—` | persisted compile verdict |
| **Test** | `12 green` / `2 failed` / `no tests` / `—` | persisted test result, of the file the Test cell would open |
| **Simulate** | `3 scenarios` / `no scenario` | counted live from the tree |
| **Deploy** | `not deployed` / `3 · 1 yours` / `9+` / `—` | asked of the chain |

**States.** The cell of the destination you are on is marked with the accent
border and ground. A cell whose fact is good reads in `--green`; a cell whose
fact is bad reads in `--mag`; an unanswerable cell reads `—` in `--dim`. Only
one thing is ever dimmed to 40%: a destination that genuinely cannot be
entered, which happens for Deploy alone, and only while the source does not
compile. Its tooltip says why.

**Staleness.** Write and Test compare the stored verdict's source timestamp
against the file's current `lastModified`. If the file moved on, the cell shows
`—`, never the old answer.

**Which test, when there are several.** The cell reports the same file the
Test destination would open — the most recently opened one — so the fact and
the click always agree. It never aggregates across test files: "14 green" from
three files, one of which is stale, would be a number with no meaning.

**The stored verdict is also the cache.** If the rail finds no verdict, or one
whose `sourceModified` no longer matches the file, it compiles the contract
once itself and stores the result. Navigation after that is free, and an edit
invalidates it exactly as it invalidates the displayed fact. The SmartC editor
keeps writing the verdict while it validates, which costs nothing because it
compiles anyway — so in practice the rail rarely has to.

This is gated on cost, and the gate is measured, not assumed: the
implementation plan first times a compile of a realistic contract. The
simulator already compiles inline at every debug start, which suggests
milliseconds. **If a compile stays under ~50 ms the rail does it; if it does
not, the rail reports only what is stored** and reads `—` until the editor has
validated once. While a compile is in flight the cell carries the running
pulse from the motion vocabulary rather than a number.

**Simulate needs no prior compile.** The simulator compiles the contract source
itself — this is why the debugger works today without an `.asm`. Only Deploy
needs machine code, and it produces it on entry.

**Tone.** The arc and the separator are drawn in `--border-2`, not in an
accent. The rail is furniture, not a notification.

**When the header runs out of room.** Below a threshold the facts drop away and
the four labels remain. Navigation never breaks; only the reporting does, and
the facts are all reachable one click further in.

## Two debuggers, named

There will be two ways into a stepping session, and they look identical:
the Simulate destination, fed by a `.scenario.json`, and the test editor's
per-test handoff, fed by a recording of a run. Confusing the two would be easy
and expensive — the recording replays a transaction stream and does not
re-evaluate assertions, which the scenario-driven session has no equivalent of.

So both name their source in their own header: `scenario · run.scenario.json`
against `recording · increments by one`. The test editor keeps its handoff
in place rather than navigating away, because there the recording belongs to
the test that produced it.

## The four destinations

| Destination | Route | What it is | What changes |
|---|---|---|---|
| **Write** | `/projects/:projectId/files/:fileId` | the contract's editor, as today | loses the `Debug` and `New Scenario` header actions |
| **Test** | the same file route | the project's test file | with several, the most recently opened one — `fs.recents` already knows; with none, the cell offers to create one, the way `New Scenario` does today |
| **Simulate** | `/projects/:projectId/simulate` | today's `DebugView` | becomes a real destination: back button works, and it joins `/debug/dashboard`, which was already a route. The scenario picker and a `New Scenario` action live here |
| **Deploy** | `/projects/:projectId/deploy` | wallet, cost, fields, publish | leaves the assembler's tabs. Compiles the contract source on entry, so it can never publish a hand-edited assembly |

The `.asm` file stays openable from the tree and keeps its technical detail —
contract size, registers, pages — because that is the one context in which the
assembly itself is the subject. But it loses its tab bar: the deployment tab is
gone to its own route, and "Assembled Output" becomes a **side panel next to
the code** rather than a view behind it, so the numbers are visible while the
assembly is being read.

`isDebugging` disappears from `smartc-editor.tsx`, and with it the branch that
returns `DebugView` in place of the editor. The test editor keeps its own
in-place debug handoff — there the recording belongs to the test that produced
it, so leaving the file would be wrong.

## Project status

A new service beside `RecentFiles`, composed into `FileSystem` the same way:

```ts
export interface CompileVerdict {
  /** The contract file's lastModified when this verdict was produced. */
  sourceModified: number;
  errorCount: number;
}

export interface TestVerdict {
  /** The test file's lastModified when the run happened. */
  sourceModified: number;
  /** The contract's lastModified then, too: a test result depends on both. */
  contractModified: number;
  passed: number;
  failed: number;
}

export interface ProjectStatusRecord {
  compile?: CompileVerdict;
  /** Keyed by test file id: several test files, several results. */
  tests: Record<string, TestVerdict>;
}
```

Stored per project folder id, in the file system's metadata blob, hydrated
through a `sanitize…` guard like the recents buffer, and pruned when a project
or test file is deleted — the file system owns it, so an entry can never
dangle.

Written from two places only: the SmartC editor when Monaco finishes validating
(it already computes exactly this in `handleValidate`), and the test runner when
a run completes. Read by the rail and, as a bonus the owner did not ask for but
will want, by the home page's project cards, which today show only a file count.

**The staleness rule is the point of the timestamps.** A test verdict depends
on two files, the test and the contract; if either moved on, the verdict is not
shown. This is the one place where a status rail can actively mislead, and the
rule exists to make that impossible rather than unlikely.

## Deployment status from the chain

On entering Deploy, and on demand from the rail, never on navigation:

1. Compile the contract source; take `MachineData.MachineCodeHashId`.
2. `getAllContractsByCodeHash({ machineCodeHash, includeDetails: false,
   firstIndex: 0, lastIndex: 9 })`.
3. `ContractList` carries no total, so ten results mean "at least ten": show
   **`9+`**. Fewer than ten is the exact count. The count itself is the useful
   part — a developer wants to know that their code is running twenty times.
4. If any returned `Contract.creator` matches the connected wallet account,
   the cell says how many are yours: `3 · 1 yours`. No local record needed for
   that either.
5. The answer is cached per code hash for the session, and the cell notes which
   network answered — the same code has different answers on testnet and
   mainnet.
6. **The node comes from the connected wallet, and from nowhere else.**
   `status.ledger.service.settings.nodeHost` (as `deployment-flow.tsx:117`
   already uses) is the only chain endpoint in the app; Studio ships no default
   node of its own and makes no network call a disconnected user did not ask
   for. Without a wallet the cell reads `—`, and its tooltip says that
   connecting one lets it ask. A failed or refused lookup is not an error
   state.

   The consequence is worth stating plainly: for anyone who has not connected a
   wallet, the fourth cell is empty. That was chosen over a bundled read-only
   node, deliberately — a local-first tool should not quietly talk to a
   third-party server about the code you are writing.

Nothing about deployment is persisted. That is the whole advantage: there is no
record to go stale, and the truth travels with the code rather than with the
browser profile.

## One contract per project, enforced

- `NewFileDialog` stops offering the SmartC type when the project already has a
  contract.
- `FileTransfer.importEntries` skips a second contract and counts it as
  skipped, which the import report already surfaces with a reason.
- Workspaces that already break the rule must not break: the contract is
  resolved deterministically by a new `pickContract` in the project domain —
  shallowest path first, then alphabetical. The home page keeps its own
  newest-wins rule and its fallback, which the project card depends on; only
  the `.smart.c` suffix predicate is shared. The Write cell's tooltip then
  names the contract it chose and says
  a second one is being ignored — silently dropping it would be worse, and the
  tooltip is the one place that can say so without shouting.
- An `inspect` project has no contract; the rail's four cells all read `—`.
  Making that destination useful is the inspector sub-project, not this one.

## The plumbing

`ResizablePanelGroup` replaces the other two idioms. The debugger gives up its
hand-rolled flex, its width state and its drag handle; the assembler gives up
its tabs. Panel sizes are persisted in one place rather than three different
ways.

`PageContent` becomes a real flex container, so the four editors say `h-full`
again instead of measuring their own offset in the viewport. The four
`calc(100vh - containerTop)` blocks and their resize listeners go.

`main-area.tsx` and `right-sidebar.tsx` are deleted.

This section is independent of the rail and should be its own cut in the
implementation plan: it can land first, on its own, and makes every surface
after it simpler to touch.

## File structure

```
apps/studio/src/
  features/project/
    contract.ts                    CREATE  the project's one contract, and the shared suffix predicate
    contract.test.ts               CREATE
    project-root.ts                CREATE  the project a route's folder id sits under
    project-root.test.ts           CREATE
  lib/file-system/
    project-status.ts              CREATE  CompileVerdict/TestVerdict + the service, beside recent-files.ts
    project-status.test.ts         CREATE
    file-system.ts                 MODIFY  compose fs.status; prune on delete
  features/workflow/
    rail.tsx                       CREATE  the four cells and the loop arc
    rail-cells.ts                  CREATE  pure: verdict + staleness → what a cell shows
    rail-cells.test.ts             CREATE
    use-project-facts.ts           CREATE  the resolved project, its files and verdicts, live
    use-deployment-count.ts        CREATE  the chain lookup, cached per hash
  pages/
    simulate/simulate-page.tsx     CREATE  the Simulate destination
    deploy/deploy-page.tsx         CREATE  the Deploy destination
  components/ui/page.tsx           MODIFY  PageContent becomes a flex container; the rail slot
  App.tsx                          MODIFY  two new routes
  features/smartc-editor/smartc-editor.tsx        MODIFY  isDebugging and two header actions go
  features/asm-editor/asm-editor.tsx              MODIFY  tabs → editor plus detail panel
  features/simulator/ui/debug-view.tsx            MODIFY  onto ResizablePanelGroup
  components/ui/layout/{main-area,right-sidebar}.tsx   DELETE
```

## The project a surface is on

Every surface in this spec — the rail, Simulate, Deploy — is *about a project*,
and none of them can take the route parameter at face value. They resolve the
root project from whatever folder id the URL carries, once, and key everything
after that on the result: the status record, the recursive file listing, and
the cells' navigation targets. A status verdict filed under `src` and read
under the project is a cell that never updates, which is the same failure as a
stale one and harder to see.

## Testing

Pure logic gets `bun test`: resolving a project from a nested folder id,
resolving a project's contract (including the two-contract fallback), the
project-status service and its hydration guard,
and `rail-cells` — which is where the staleness rule lives and therefore the
most important test in this spec. The chain lookup is tested against a fake
`ContractApi`, covering the ten-result cap and the creator match.

There is no DOM test environment, so the rail, the two new pages and the panel
work are verified in the browser, as in the previous phase.

## Out of scope

Keyboard control — the MRU switcher, the command palette, shortcuts — is phase
2B, and it comes after this one so that it has a finished shape to map onto.
Editor tabs and split views are not coming at all. Multiple contracts
interacting is the inspector/sandbox topic. And the status record holds no
history, no timings and no trends: four cells, and exactly the data those four
cells need.
