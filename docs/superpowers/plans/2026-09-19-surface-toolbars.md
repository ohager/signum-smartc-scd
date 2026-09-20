# Where the Verbs Live — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every action out of the page header into the surface it belongs to, under one 44px toolbar with fixed slots, and redraw the workflow rail as a track that can be read at a glance.

**Architecture:** A new presentational `SurfaceToolbar` (left: verbs, middle: context, right: readout + window icons) replaces three strips. Each surface passes its own verbs as children — no global store, no registration from effects. The rail becomes one SVG drawing with transparent HTML buttons on top, so tooltips, focus and `disabled` keep working while the geometry aligns by construction.

**Tech Stack:** React 19, TypeScript, Tailwind v4 with the climate token layer (`apps/studio/styles/globals.css`), jotai (one store gets deleted), bun test, Monaco via `@monaco-editor/react`.

**Spec:** `docs/superpowers/specs/2026-09-19-surface-toolbars-design.md`

## Global Constraints

- All work is in `apps/studio/`. Run commands from `apps/studio/` unless stated otherwise.
- **Toolbar height is 44px.** Slots never move: verbs left (primary first, groups split by a hairline), context middle, readout then window icons right.
- **File operations (Save, Download, Format) stay icon-only on the right.** The left slot is for what the surface is *for*.
- **The simulate stage keeps the name "Simulate".** Internal identifiers (`DebugView`, `DebugController`, …) keep theirs.
- **A filled rail diamond carries the fact's tone, never progress.** Neutral/unknown is always an outline.
- **Rail facts stay hidden below the `lg` breakpoint.** Navigation must never break, only reporting.
- **Colours come from climate tokens only** — `var(--accent-1|2|3)`, `var(--green)`, `var(--mag)`, `var(--dim)`, `var(--text)`, `var(--border-1|2)`. No hex literals.
- **Testing reality:** this repo has 63 pure `*.test.ts` files and zero DOM tests; there is no `@testing-library/react`, no happy-dom. **Do not add test infrastructure in this plan.** Pure descriptors get unit tests; view code is verified by `bunx tsc --noEmit -p tsconfig.json`, `bun run build`, and the named visual check in each task.
- `bunx tsc --noEmit -p tsconfig.json` reports **pre-existing** errors (`monaco-editor` module resolution, `wallet-provider.tsx`, `lodash`, `bun-plugin-tailwind`). Compare against the baseline; a task passes when it adds no *new* error in the files it touched.
- Commit after every task, in the repo's style: `feat(studio): <lowercase summary>` with the trailer `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`.

---

## File Structure

**Created**

| File | Responsibility |
| --- | --- |
| `src/components/ui/surface-toolbar.tsx` | The toolbar, its three slots, the button weights, the divider, the readout, the diagnostic |
| `src/features/workflow/rail-marks.ts` | Pure: tone → diamond appearance, barred → opacity |
| `src/features/workflow/rail-marks.test.ts` | Its tests |
| `src/features/workflow/rail-track.tsx` | The rail's SVG drawing plus the transparent buttons over it |
| `src/features/simulator/ui/simulator-help.tsx` | The four sentences that explain the simulator, shared by the empty state and the `?` popover |
| `src/components/ui/header-ownership.test.ts` | Guard: nothing imports the deleted header-action machinery |

**Rewritten**

| File | Change |
| --- | --- |
| `src/features/smartc-editor/smartc-editor.tsx` | Owns `Compile`; loses two `addAction` effects |
| `src/features/asm-editor/code-editor/asm-code-editor.tsx` | Owns `Deploy` |
| `src/features/simulator/scenario/scenario-editor.tsx` | Toolbar swap only (no verbs) |
| `src/features/testbed/ui/test-file-editor.tsx` | Owns `Run` and `Debug`; loses two `addAction` effects |
| `src/features/simulator/ui/debug-toolbar.tsx` | Becomes a `SurfaceToolbar` composition; absorbs the scenario strip |
| `src/features/simulator/ui/debug-view.tsx` | Its own 30px strip disappears into the toolbar |
| `src/pages/simulate/simulate-page.tsx` | Passes `onNewScenario` down instead of registering a header action |
| `src/features/workflow/rail.tsx` | Keeps the data gathering, hands stops to `rail-track.tsx` |
| `src/components/ui/page.tsx` | Header loses the actions block; padding `p-4` → `px-4 py-0.5` |
| `src/components/ui/editor/file-actions.tsx` | Doc comment states the new rule |

**Deleted**

`src/stores/page-header-actions-atoms.ts`, `src/hooks/use-page-header-actions.ts`, `src/components/ui/editor/editor-toolbar.tsx`, and the no-op `usePageHeaderActions()` call at `src/pages/files/files-page.tsx:22`.

---

### Task 1: The toolbar component

Creates the component with no consumers yet, so the migration tasks that follow are pure swaps.

**Files:**
- Create: `apps/studio/src/components/ui/surface-toolbar.tsx`
- Modify: `apps/studio/src/components/ui/editor/actionButton.tsx:25`

**Interfaces:**
- Consumes: `cn` from `@/lib/utils`, `Tooltip`/`TooltipTrigger`/`TooltipContent` from `@/components/ui/tooltip`.
- Produces:
  - `<SurfaceToolbar verbs? context? readout? />` — all three props `ReactNode`, all optional.
  - `<ToolbarButton weight="primary"|"secondary" onClick disabled? title? >{children}</ToolbarButton>`
  - `<ToolbarIconButton label onClick disabled? >{icon}</ToolbarIconButton>` — `label` is both `aria-label` and tooltip.
  - `<ToolbarDivider />`
  - `<ToolbarReadout items={{ label: string; value: string; tone?: "good"|"bad" }[]} />`
  - `<ToolbarDiagnostic tone="error"|"warning">{message}</ToolbarDiagnostic>` — moved verbatim in behaviour from `editor-toolbar.tsx`, which is deleted in Task 7.

- [ ] **Step 1: Write the component**

```tsx
// apps/studio/src/components/ui/surface-toolbar.tsx
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The one strip every working surface wears.
 *
 * Three slots that never move: what this surface is *for* on the left, what it
 * is working on in the middle, what it currently reads on the right. Fixed
 * positions are the point — what you learn in the debugger holds in the
 * editor, and size alone orients nobody.
 *
 * Replaces three strips that did this job at three sizes: the editors' 30px
 * `EditorToolbar`, the debugger's hand-rolled row, and the scenario picker
 * above it.
 */
export function SurfaceToolbar({
  verbs,
  context,
  readout,
  className,
}: {
  verbs?: ReactNode;
  context?: ReactNode;
  readout?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-[44px] w-full shrink-0 items-center gap-2 border-b border-[var(--border-1)] bg-[var(--bg2)] px-2.5",
        className,
      )}
    >
      {/* Both groups may be empty — two surfaces genuinely have no verbs. The
          slots stay anyway, because they are a grid and not a suggestion. */}
      <div className="flex min-w-0 items-center gap-1.5">{verbs}</div>
      <div className="flex min-w-0 items-center gap-1.5">{context}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">{readout}</div>
    </section>
  );
}

const BUTTON_BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-[13px] " +
  "transition-colors disabled:pointer-events-none disabled:opacity-40 " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]";

export function ToolbarButton({
  weight = "secondary",
  onClick,
  disabled,
  title,
  children,
}: {
  weight?: "primary" | "secondary";
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        BUTTON_BASE,
        weight === "primary"
          ? "border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-1)_22%,transparent)] text-[var(--accent-2)] hover:bg-[color-mix(in_srgb,var(--accent-1)_32%,transparent)]"
          : "border-[var(--border-2)] hover:border-[var(--accent-2)]",
      )}
    >
      {children}
    </button>
  );

  if (!title) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}

/**
 * For the things that are not verbs — popping out a window, closing one,
 * saving the file. They keep their tooltip, and they leave the row of words.
 */
export function ToolbarIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          onClick={onClick}
          disabled={disabled}
          className={cn(
            BUTTON_BASE,
            "border-[var(--border-1)] px-2 text-[var(--dim)] hover:text-[var(--text)]",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ToolbarDivider() {
  return <span aria-hidden className="mx-1 h-[22px] w-px bg-[var(--border-1)]" />;
}

/**
 * The numbers a surface is currently reading, as one instrument rather than a
 * scatter of pills: one border, hairlines between the fields.
 */
export function ToolbarReadout({
  items,
}: {
  items: { label: string; value: string; tone?: "good" | "bad" }[];
}) {
  return (
    <span className="flex items-stretch border border-[var(--border-1)] font-mono text-[11px] text-[var(--dim)]">
      {items.map(({ label, value, tone }) => (
        <span
          key={label}
          className="border-l border-[var(--border-1)] px-2.5 py-1 first:border-l-0"
        >
          {label}{" "}
          <span
            style={{
              color:
                tone === "bad"
                  ? "var(--mag)"
                  : tone === "good"
                    ? "var(--green)"
                    : "var(--text)",
            }}
          >
            {value}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * A diagnostic in the strip. Colour never carries the state on its own — the
 * glyph says which it is even where the two hues are close, as they are in
 * Solaris.
 */
export function ToolbarDiagnostic({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className="flex items-center gap-1 truncate text-xs"
      style={{ color: tone === "error" ? "var(--mag)" : "var(--amber)" }}
    >
      <span aria-hidden>{tone === "error" ? "●" : "▲"}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}
```

- [ ] **Step 2: Fix the type error in the icon button that stays**

`EditorActionButton` is kept for the file icons. Its `cva` call declares no `size` variant but sets one as a default, which `tsc` reports today. In `apps/studio/src/components/ui/editor/actionButton.tsx`, change:

```tsx
    defaultVariants: {
      variant: "default",
      size: "default",
    },
```

to:

```tsx
    defaultVariants: {
      variant: "default",
    },
```

- [ ] **Step 3: Verify it compiles**

Run from `apps/studio/`:
```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "surface-toolbar|actionButton"
```
Expected: no output. (The pre-existing `actionButton.tsx(25,7)` error is now gone.)

```bash
bun run build
```
Expected: `✅ Build completed`.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/components/ui/surface-toolbar.tsx apps/studio/src/components/ui/editor/actionButton.tsx
git commit -m "feat(studio): one strip for every working surface

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 2: The SmartC editor owns Compile

**Files:**
- Modify: `apps/studio/src/features/smartc-editor/smartc-editor.tsx` (imports, the two `addAction`/`updateAction` effects at `:120-143`, the `EditorToolbar` block at `:192-210`)

**Interfaces:**
- Consumes: `SurfaceToolbar`, `ToolbarButton`, `ToolbarDiagnostic` from Task 1.
- Produces: nothing other tasks depend on.

- [ ] **Step 1: Remove the header registration**

Delete the `usePageHeaderActions` import, the `const { addAction, removeAction, updateAction } = usePageHeaderActions();` line, the `enum ActionType` member usage for registration, and **both** `useEffect` blocks that call `addAction` / `updateAction` (they start at `:120` and `:140`). Keep `ActionType.Compile` — `editor.addAction` at `:179` still uses it as the Monaco command id.

- [ ] **Step 2: Swap the toolbar**

Replace the `<EditorToolbar …> … </EditorToolbar>` block with:

```tsx
      <SurfaceToolbar
        verbs={
          <ToolbarButton
            weight="primary"
            onClick={compileSmartC}
            disabled={!isValid}
            title={`Compile this contract (${isMac ? "⇧⌘C" : "Ctrl+Shift+C"})`}
          >
            <Code2 className="h-4 w-4" />
            Compile
          </ToolbarButton>
        }
        context={
          !isValid ? (
            <ToolbarDiagnostic tone="error">{validationError}</ToolbarDiagnostic>
          ) : null
        }
        readout={
          <EditorFileActions
            isDirty={isDirty}
            onSave={saveSmartCFile}
            onDownload={download}
          />
        }
      />
```

Add next to the other module-level constants in the same file:

```tsx
const isMac =
  typeof navigator !== "undefined" && /Mac|iP(hone|ad|od)/i.test(navigator.userAgent);
```

Update the imports: drop `EditorToolbar`/`EditorDiagnostic` and `usePageHeaderActions`, add

```tsx
import {
  SurfaceToolbar,
  ToolbarButton,
  ToolbarDiagnostic,
} from "@/components/ui/surface-toolbar.tsx";
```

- [ ] **Step 3: Verify**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep smartc-editor
bun run build
```
Expected: no output from the first, a successful build from the second.

Visual check (dev server on `http://localhost:3000`): open a `.smart.c` file. **Compile** stands at the left of a 44px strip with an accent fill; introducing a syntax error disables it and puts a red `●` diagnostic beside it; the save/download icons sit at the right; the page header above shows only the title, the badge and the rail.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/smartc-editor/smartc-editor.tsx
git commit -m "feat(studio): compile belongs to the contract, not the header

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 3: The ASM editor owns Deploy

**Files:**
- Modify: `apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx` (the `EditorToolbar` block at `:69-90`)

**Interfaces:**
- Consumes: Task 1's exports; `useNavigate` and `useParams` from `react-router`; `findProjectOfFolder` from `@/features/project/project-root`; `useFileSystem` from `@/hooks/use-file-system.ts`.
- Produces: nothing.

The assembly file is the one surface where the machine image is the subject, so the next destination it offers is Deploy. It **navigates**; it does not deploy the `.asm` — `DeployPage` compiles from source on purpose (`src/pages/deploy/deploy-page.tsx:12-19`).

- [ ] **Step 1: Resolve the project and add the verb**

Add to the imports:

```tsx
import { useNavigate } from "react-router";
import { Rocket } from "lucide-react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { findProjectOfFolder } from "@/features/project/project-root";
import {
  SurfaceToolbar,
  ToolbarButton,
  ToolbarDiagnostic,
} from "@/components/ui/surface-toolbar.tsx";
```

Inside `AsmCodeEditor`, above the returned JSX:

```tsx
  const navigate = useNavigate();
  const fs = useFileSystem();
  // The folder an `.asm` sits in is not always the project — the same
  // resolution the rail uses keeps the two in step.
  const projectId = findProjectOfFolder(fs, file.metadata.folderId);
```

- [ ] **Step 2: Swap the toolbar**

Replace the `<EditorToolbar …> … </EditorToolbar>` block with:

```tsx
      <SurfaceToolbar
        verbs={
          <ToolbarButton
            weight="primary"
            onClick={() => projectId && navigate(`/projects/${projectId}/deploy`)}
            disabled={!projectId}
            title="Publish this contract to the chain"
          >
            <Rocket className="h-4 w-4" />
            Deploy
          </ToolbarButton>
        }
        context={
          <>
            {!isValid && (
              <ToolbarDiagnostic tone="error">{validationError}</ToolbarDiagnostic>
            )}
            <ToolbarDiagnostic tone="warning">
              Hand edits are overwritten by the next compile
            </ToolbarDiagnostic>
          </>
        }
        readout={
          <EditorFileActions
            isDirty={isDirty}
            onSave={saveAsmFile}
            onDownload={download}
          />
        }
      />
```

The old prose — "Change this file only if you know what you are doing! (Each smart.c compilation will overwrite your manual changes)" — is replaced by the warning diagnostic above: same fact, one line, in the interface's voice.

- [ ] **Step 3: Verify**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep asm-code-editor
bun run build
```
Expected: no output, successful build.

Visual check: open an `.asm` file. **Deploy** sits left; clicking it lands on `/projects/<id>/deploy`. The amber `▲` warning sits in the middle slot, the file icons right. The assembled-output panel from the earlier work is unchanged.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/asm-editor/code-editor/asm-code-editor.tsx
git commit -m "feat(studio): the assembly offers the next destination

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 4: The scenario editor and the testbed

Two surfaces, one commit: the scenario editor is a pure swap, and the testbed is the last `addAction` outside the simulator.

**Files:**
- Modify: `apps/studio/src/features/simulator/scenario/scenario-editor.tsx` (the `EditorToolbar` block at `:79-103`)
- Modify: `apps/studio/src/features/testbed/ui/test-file-editor.tsx` (the two effects at `:216-233`, the toolbar block at `:272-290`)

**Interfaces:**
- Consumes: Task 1's exports. `runFile` and `debugActiveTest` already exist in `test-file-editor.tsx` (`:149` and `:204-214`).
- Produces: nothing.

- [ ] **Step 1: Scenario editor — swap the toolbar**

Replace its `<EditorToolbar …>` block with:

```tsx
      <SurfaceToolbar
        context={
          !isValid ? (
            <ToolbarDiagnostic tone="error">
              {errors.length > 1 ? `${errors.length} errors: ${errors[0]}` : errors[0]}
            </ToolbarDiagnostic>
          ) : null
        }
        readout={
          <EditorFileActions
            isDirty={isDirty}
            onSave={saveNow}
            onDownload={download}
            onFormat={formatDocument}
          />
        }
      />
```

No `verbs` prop: this surface has none, and the empty slot is correct.

- [ ] **Step 2: Testbed — remove the header registration**

In `test-file-editor.tsx`, delete the `usePageHeaderActions` import, the `const { addAction, removeAction, updateAction } = usePageHeaderActions();` line at `:47`, and both `useEffect` blocks at `:216` and `:231`.

- [ ] **Step 3: Testbed — own Run and Debug**

Replace its `<EditorToolbar …>` block with:

```tsx
      <SurfaceToolbar
        verbs={
          <>
            <ToolbarButton
              weight="primary"
              onClick={() =>
                runFile().catch((e) =>
                  toast.error("Could not run tests: " + (e as Error).message),
                )
              }
              disabled={isRunning}
              title="Run this test file"
            >
              <Play className="h-4 w-4" />
              Run
            </ToolbarButton>
            <ToolbarButton
              onClick={() => {
                debugActiveTest().catch((e) =>
                  toast.error("Could not debug: " + (e as Error).message),
                );
              }}
              disabled={isRunning || !activeTestId}
              title="Run the test at the cursor and step through it"
            >
              Debug
            </ToolbarButton>
          </>
        }
        context={
          isRunning ? (
            <span className="motion-pulse text-xs text-[var(--accent-3)]">running…</span>
          ) : null
        }
        readout={
          <EditorFileActions isDirty={isDirty} onSave={saveNow} onDownload={download} />
        }
      />
```

**Debug means the in-app step debugger.** The browser's DevTools cannot be opened from a page — no API exists, and `src/features/testbed/ui/devtools-help.tsx:22` already states it. The "Debug run (DevTools)" checkbox stays exactly where it is, in the right panel with its help popover; it is a different thing and keeps its name.

- [ ] **Step 4: Verify**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "scenario-editor|test-file-editor"
bun run build
bun test
```
Expected: no output from the first, successful build, 587 tests passing.

Visual check: open a `.scenario.json` — 44px strip, no verbs, errors in the middle, icons right. Open a `.test.ts` — **Run** accent-filled at the left with **Debug** beside it; `Debug` greys out when the cursor is not in a test; running shows "running…" in the middle. The page header carries no buttons on either.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/simulator/scenario/scenario-editor.tsx apps/studio/src/features/testbed/ui/test-file-editor.tsx
git commit -m "feat(studio): tests are run from the test file

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 5: The simulator, untangled

Two 30px strips become one 44px toolbar, and the step vocabulary stops naming two granularities almost the same.

**Files:**
- Modify: `apps/studio/src/features/simulator/ui/debug-toolbar.tsx` (whole file)
- Modify: `apps/studio/src/features/simulator/ui/debug-view.tsx:60-86` (the scenario strip, and the props it forwards)
- Modify: `apps/studio/src/pages/simulate/simulate-page.tsx:32,66-90,108-118`

**Interfaces:**
- Consumes: Task 1's exports; `DebugState` from `../engine/engine.types`.
- Produces:
  - `DebugToolbar` props gain: `scenarios: ScenarioEntry[]`, `selectedName: string`, `onSelectScenario: (name: string) => void`, `onNewScenario?: () => void`.
  - `DebugView` props gain: `onNewScenario?: () => void`.

Ground truth for the renaming, read from `src/features/simulator/engine/simulator-engine.ts`: `step()` (`:70`) advances **one AT instruction**; `stepInto()` (`:76`) calls `stepIntoSlotContract()` and advances **a source line**. The handler names do not change — only the labels, and where they appear.

- [ ] **Step 1: Rewrite the toolbar**

```tsx
// apps/studio/src/features/simulator/ui/debug-toolbar.tsx
import type { DebugState } from "../engine/engine.types";
import type { ScenarioEntry } from "./debug-view";
import {
  SurfaceToolbar,
  ToolbarButton,
  ToolbarDivider,
  ToolbarIconButton,
  ToolbarReadout,
} from "@/components/ui/surface-toolbar.tsx";
import { SimulatorHelp } from "./simulator-help";

interface Props {
  state: DebugState | null;
  onStep: () => void;
  onStepInto: () => void;
  onContinue: () => void;
  onForgeNextBlock: () => void;
  onReset: () => void;
  onClose: () => void;
  onPopOut?: () => void;
  viewMode: "source" | "asm";
  onViewMode: (mode: "source" | "asm") => void;
  scenarios: ScenarioEntry[];
  selectedName: string;
  onSelectScenario: (name: string) => void;
  onNewScenario?: () => void;
}

export function DebugToolbar({
  state,
  onStep,
  onStepInto,
  onContinue,
  onForgeNextBlock,
  onReset,
  onClose,
  onPopOut,
  viewMode,
  onViewMode,
  scenarios,
  selectedName,
  onSelectScenario,
  onNewScenario,
}: Props) {
  const status = state?.status ?? "ready";
  const done = status === "finished" || status === "error";

  return (
    <SurfaceToolbar
      verbs={
        <>
          <ToolbarButton weight="primary" onClick={onContinue} disabled={done}>
            ▶ Continue
          </ToolbarButton>
          {/* `stepInto` is the source-line step — the one usually wanted, so it
              is the one that carries the plain name. */}
          <ToolbarButton onClick={onStepInto} disabled={done} title="Advance one source line">
            Step
          </ToolbarButton>
          {/* One AT instruction. It is the asm view's granularity, so it is
              offered where that granularity is on screen and nowhere else. */}
          {viewMode === "asm" && (
            <ToolbarButton onClick={onStep} disabled={done} title="Advance one AT instruction">
              Step instruction
            </ToolbarButton>
          )}
          <ToolbarDivider />
          {/* Moves the chain, not the contract — hence its own group. */}
          <ToolbarButton
            onClick={onForgeNextBlock}
            title="Forge the next block and deliver its scheduled transactions"
          >
            ⛏ Next block
          </ToolbarButton>
          <ToolbarDivider />
          <ToolbarButton onClick={onReset} title="Start this scenario over">
            ⟳ Reset
          </ToolbarButton>
        </>
      }
      context={
        <>
          <select
            aria-label="Scenario"
            className="max-w-[220px] border border-[var(--border-1)] bg-transparent px-2 py-1 font-mono text-[11px]"
            value={selectedName}
            onChange={(e) => onSelectScenario(e.target.value)}
          >
            {scenarios.length === 0 && <option value="">(built-in default)</option>}
            {scenarios.map((s) => (
              <option key={s.name} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
          {onNewScenario && (
            <ToolbarButton onClick={onNewScenario} title="Create a run scenario for this contract">
              + New
            </ToolbarButton>
          )}
          <span className="inline-flex border border-[var(--border-2)] text-xs">
            {(["source", "asm"] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => onViewMode(mode)}
                aria-pressed={viewMode === mode}
                className={
                  "px-2.5 py-1.5 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] " +
                  (mode === "asm" ? "border-l border-[var(--border-2)] " : "") +
                  (viewMode === mode
                    ? "bg-[color-mix(in_srgb,var(--accent-1)_28%,transparent)]"
                    : "opacity-70 hover:opacity-100")
                }
              >
                {mode}
              </button>
            ))}
          </span>
          <SimulatorHelp />
        </>
      }
      readout={
        <>
          <ToolbarReadout
            items={[
              { label: "block", value: String(state?.currentBlock ?? 0) },
              {
                label: "",
                value: status,
                tone: status === "error" ? "bad" : status === "running" ? "good" : undefined,
              },
              { label: "step", value: String(state?.steps ?? 0) },
              ...(state?.currentSourceLine != null
                ? [{ label: "line", value: String(state.currentSourceLine) }]
                : []),
            ]}
          />
          {state?.error && (
            <span className="max-w-[240px] truncate text-xs text-[var(--mag)]" title={state.error}>
              {state.error}
            </span>
          )}
          {onPopOut && (
            <ToolbarIconButton label="Open a live debug dashboard in a separate tab" onClick={onPopOut}>
              ⧉
            </ToolbarIconButton>
          )}
          <ToolbarIconButton label="Close the simulator" onClick={onClose}>
            ✕
          </ToolbarIconButton>
        </>
      }
    />
  );
}
```

- [ ] **Step 2: Delete the scenario strip from `debug-view.tsx`**

In `DebugView`, delete the whole `<div className="flex items-center gap-2 h-[30px] …">…</div>` block (`:62-81`) — including the stale hint "— create one with 'New Scenario' on the contract", which Task 6 replaces properly. `DebugView` keeps `selectedName`/`setSelectedName` and now forwards them, plus `scenarios` and `onNewScenario`, into `DebugSession` and on to `DebugToolbar`. Add `onNewScenario?: () => void` to both `Props` interfaces and thread it through.

`sourceLabel` moves into the readout: pass it to `DebugToolbar` only if it is set, as a leading `ToolbarReadout` item — or drop the prop if the simplest threading is cleaner; it is informational and its text already appears in the scenario picker.

- [ ] **Step 3: `simulate-page.tsx` hands the action down**

Delete the `usePageHeaderActions` import, the destructuring at `:32`, and the whole `useEffect` that registers `new-scenario` (`:66-90`). Keep the body of its `onClick` as a named callback and pass it down:

```tsx
  const createScenario = useCallback(async () => {
    if (!projectId || !contract) return;
    const existing = new Set(
      fs.listFolderContents(projectId).files.map((f) => f.metadata.name),
    );
    const base = contract.name.split(".")[0]!.toLowerCase();
    let name = `${base}.scenario.json`;
    for (let n = 2; existing.has(name); n++) name = `${base}-${n}.scenario.json`;

    await fs.addFile(projectId, name, FileTypes.Scenario, serializeScenario(defaultScenario()));
    // No navigation: the new scenario appears in this page's own picker,
    // because `useProjectFacts` hears the `file:added` event.
  }, [fs, projectId, contract?.id, contract?.name]);
```

and on the `<DebugView …>` element add `onNewScenario={createScenario}`.

- [ ] **Step 4: Verify**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "debug-toolbar|debug-view|simulate-page"
bun run build
bun test
```
Expected: no output from the first (note: `debug-view.tsx` has a **pre-existing** `monaco-editor` error — that one line is allowed), successful build, 587 passing.

Visual check: open Simulate. **One** 44px strip, not two. `▶ Continue` accent-filled, `Step` beside it, **no** `Step instruction` — switch the view toggle to `asm` and it appears. `⛏ Next block` and `⟳ Reset` each behind a hairline. Scenario picker, `+ New` and `?` in the middle; creating a scenario adds it to the picker without navigating. Readout, `⧉` and `✕` right. Header shows no buttons.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/simulator/ui/debug-toolbar.tsx apps/studio/src/features/simulator/ui/debug-view.tsx apps/studio/src/pages/simulate/simulate-page.tsx
git commit -m "feat(studio): one transport, and a step that says which kind

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 6: The simulator explains itself

**Files:**
- Create: `apps/studio/src/features/simulator/ui/simulator-help.tsx`
- Modify: `apps/studio/src/features/simulator/ui/debug-view.tsx` (the empty case)

**Interfaces:**
- Consumes: `Popover`-style idiom of `src/features/testbed/ui/devtools-help.tsx` — read that file first and follow it exactly.
- Produces: `<SimulatorHelp />` (the `?` trigger, used by Task 5's toolbar) and `<SimulatorInvitation onCreate />` (the empty state).

- [ ] **Step 1: Write the component**

```tsx
// apps/studio/src/features/simulator/ui/simulator-help.tsx
import { Panel } from "@/components/ui/panel.tsx";
import { ToolbarButton } from "@/components/ui/surface-toolbar.tsx";

/**
 * How this thing works, in four sentences.
 *
 * The model is not guessable from the controls: the chain is invented, the
 * blocks do not arrive on their own, and the transactions come from a file.
 * One copy, shown twice — as the empty state's invitation and behind the `?`
 * once the empty state is gone.
 */
export const SIMULATOR_MODEL = [
  "Your contract runs here in an invented Signum chain.",
  "A scenario supplies the transactions that poke it.",
  "Blocks only exist when you forge them — that is what “Next block” does.",
  "Set breakpoints in the margin; “Step” advances one source line.",
];

export function SimulatorHelp() {
  return (
    /* Mirror the trigger/popover markup of `devtools-help.tsx` so the two
       helps behave identically. */
    <details className="relative">
      <summary
        aria-label="How the simulator works"
        className="cursor-pointer list-none border border-[var(--border-1)] px-2 py-1.5 text-[13px] text-[var(--dim)] hover:text-[var(--text)]"
      >
        ?
      </summary>
      <div className="absolute left-0 top-full z-50 mt-1 w-[340px] border border-[var(--border-2)] bg-[var(--bg2)] p-3 text-xs">
        <ul className="space-y-1.5">
          {SIMULATOR_MODEL.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </div>
    </details>
  );
}

export function SimulatorInvitation({ onCreate }: { onCreate?: () => void }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <Panel variant="bracketed" className="max-w-[460px] p-5">
        <h2 className="mb-2 text-sm font-medium">No scenario yet</h2>
        <ul className="mb-4 space-y-1.5 text-xs text-[var(--dim)]">
          {SIMULATOR_MODEL.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {onCreate && (
          <ToolbarButton weight="primary" onClick={onCreate}>
            Create the first scenario
          </ToolbarButton>
        )}
      </Panel>
    </div>
  );
}
```

If `devtools-help.tsx` uses a Radix `Popover` rather than `<details>`, use the same component here instead — matching the existing idiom outranks the markup written above.

- [ ] **Step 2: Show the invitation when there is no scenario**

In `DebugView`, when `scenarios.length === 0`, render `<SimulatorInvitation onCreate={onNewScenario} />` in place of `<DebugSession …>`. The toolbar stays visible above it, so the `?` and the picker remain reachable.

- [ ] **Step 3: Verify**

```bash
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "simulator-help|debug-view"
bun run build
```
Expected: no new errors, successful build.

Visual check: a project with no `.scenario.json` shows the invitation with the four sentences and a working "Create the first scenario"; afterwards the session appears. The `?` in the toolbar shows the same four sentences and closes again.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/simulator/ui/simulator-help.tsx apps/studio/src/features/simulator/ui/debug-view.tsx
git commit -m "feat(studio): say how the invented chain works

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 7: Delete the header-action machinery

Only now: every writer is gone, so the store can go with them.

**Files:**
- Delete: `apps/studio/src/stores/page-header-actions-atoms.ts`
- Delete: `apps/studio/src/hooks/use-page-header-actions.ts`
- Delete: `apps/studio/src/components/ui/editor/editor-toolbar.tsx`
- Modify: `apps/studio/src/components/ui/page.tsx:4,46,68-88` and the `p-4` at `:57`
- Modify: `apps/studio/src/pages/files/files-page.tsx:5,22`
- Modify: `apps/studio/src/components/ui/editor/file-actions.tsx:4-10`
- Create: `apps/studio/src/components/ui/header-ownership.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing.

- [ ] **Step 1: Write the failing guard test**

```ts
// apps/studio/src/components/ui/header-ownership.test.ts
import { describe, expect, it } from "bun:test";
import { Glob } from "bun";

/**
 * The header carries identity and the rail. Nothing else.
 *
 * Actions used to be pushed into it from three features through a global atom,
 * which is why the header's contents depended on which feature mounted last.
 * The machinery is gone; this is the test that keeps it gone, because the
 * failure mode of its return is subtle — a button that appears one frame late
 * in a place that does not own it.
 */
const SOURCE = new Glob("**/*.{ts,tsx}");
const ROOT = new URL("../../", import.meta.url).pathname; // apps/studio/src

async function sourcesMentioning(needle: string) {
  const hits: string[] = [];
  for await (const path of SOURCE.scan({ cwd: ROOT })) {
    const text = await Bun.file(ROOT + path).text();
    if (text.includes(needle)) hits.push(path);
  }
  return hits;
}

describe("page header ownership", () => {
  it("has no header-action store left", async () => {
    expect(await sourcesMentioning("page-header-actions-atoms")).toEqual([]);
  });

  it("is reached by no feature", async () => {
    expect(await sourcesMentioning("usePageHeaderActions")).toEqual([]);
  });

  it("keeps no second toolbar idiom", async () => {
    const hits = await sourcesMentioning("EditorToolbar");
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and watch it fail**

```bash
bun test src/components/ui/header-ownership.test.ts
```
Expected: FAIL — three failing expectations listing the files that still mention each name (at minimum `components/ui/page.tsx`, `hooks/use-page-header-actions.ts`, `pages/files/files-page.tsx`).

- [ ] **Step 3: Delete the machinery**

```bash
git rm apps/studio/src/stores/page-header-actions-atoms.ts \
       apps/studio/src/hooks/use-page-header-actions.ts \
       apps/studio/src/components/ui/editor/editor-toolbar.tsx
```

In `components/ui/page.tsx`: remove the `usePageHeaderActions` import (`:4`), the `const { actions } = usePageHeaderActions();` line (`:46`), and the entire `{actions && actions.length > 0 && ( … )}` block (`:68-88`). Update the comment above the header — it explains an ordering problem between actions and the rail that no longer exists. Change the header's `p-4` to `px-4 py-0.5`, so Task 8's 52px rail fits inside 60px with air.

In `pages/files/files-page.tsx`: remove the import (`:5`) and the no-op call (`:22`).

In `components/ui/editor/file-actions.tsx`, replace the doc comment's last sentence — "Page header actions stay reserved for file-type specific commands (Compile, Debug, ...)" — with:

```
 * They sit on the right of the surface toolbar as icons, beside the readout:
 * the left slot is for what the surface is *for*, and file operations are
 * housekeeping that works identically everywhere.
```

- [ ] **Step 4: Run the test and the suite**

```bash
bun test src/components/ui/header-ownership.test.ts
bun test
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "page\.tsx|files-page|file-actions"
bun run build
```
Expected: the guard passes; the full suite is 590 passing (587 + 3); no new type errors; successful build.

Visual check: every surface still shows its own verbs; no page header anywhere shows a button.

- [ ] **Step 5: Commit**

```bash
git add -A apps/studio/src
git commit -m "feat(studio): the header stops being filled by remote control

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

### Task 8: The rail becomes a track

**Files:**
- Create: `apps/studio/src/features/workflow/rail-marks.ts`
- Create: `apps/studio/src/features/workflow/rail-marks.test.ts`
- Create: `apps/studio/src/features/workflow/rail-track.tsx`
- Modify: `apps/studio/src/features/workflow/rail.tsx:150-215` (everything from the returned JSX down, including `RailCell`)

**Interfaces:**
- Consumes: `CellTone` from `./rail-cells`.
- Produces:
  - `railMark(tone: CellTone): { fill: string; stroke: string }`
  - `<RailTrack stops={Stop[]} />` where `Stop = { id: string; label: string; fact: string; tone: CellTone; here: boolean; barred: boolean; hint: string; go?: () => void }`

- [ ] **Step 1: Write the failing test**

```ts
// apps/studio/src/features/workflow/rail-marks.test.ts
import { describe, expect, it } from "bun:test";
import { railMark } from "./rail-marks";

describe("railMark", () => {
  it("fills a good fact green and a bad one magenta", () => {
    expect(railMark("good").fill).toBe("var(--green)");
    expect(railMark("bad").fill).toBe("var(--mag)");
  });

  /**
   * The rule the whole rail rests on. A filled mark must never be readable as
   * "this stage is done" — the cells report a fact, and a stage that has not
   * answered yet is an outline, not a tick.
   */
  it("leaves an unknown fact hollow", () => {
    expect(railMark("neutral").fill).toBe("none");
    expect(railMark("neutral").stroke).toBe("var(--dim)");
  });

  it("uses one colour per mark, so the outline never contradicts the fill", () => {
    for (const tone of ["good", "bad"] as const) {
      expect(railMark(tone).stroke).toBe(railMark(tone).fill);
    }
  });
});
```

- [ ] **Step 2: Run it to watch it fail**

```bash
bun test src/features/workflow/rail-marks.test.ts
```
Expected: FAIL — `Cannot find module './rail-marks'`.

- [ ] **Step 3: Write the module**

```ts
// apps/studio/src/features/workflow/rail-marks.ts
import type { CellTone } from "./rail-cells";

/**
 * How a stop on the track is drawn.
 *
 * The mark carries the *fact*, never the progress: a filled diamond means the
 * stage reported something good or something bad, and a hollow one means it
 * has not answered. "Done" is deliberately unsayable — it is the step-number
 * claim the rail exists to avoid.
 */
export function railMark(tone: CellTone): { fill: string; stroke: string } {
  if (tone === "good") return { fill: "var(--green)", stroke: "var(--green)" };
  if (tone === "bad") return { fill: "var(--mag)", stroke: "var(--mag)" };
  return { fill: "none", stroke: "var(--dim)" };
}
```

- [ ] **Step 4: Run the test to verify it passes**

```bash
bun test src/features/workflow/rail-marks.test.ts
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Write the drawing**

The geometry is fixed so the SVG and the buttons over it cannot drift: viewBox `0 0 420 52`, stops at x = 50, 150, 250 (the repeating three) and 370 (Deploy).

```tsx
// apps/studio/src/features/workflow/rail-track.tsx
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { CellTone } from "./rail-cells";
import { railMark } from "./rail-marks";

export interface Stop {
  id: string;
  label: string;
  fact: string;
  tone: CellTone;
  here: boolean;
  barred: boolean;
  hint: string;
  go?: () => void;
}

const X = [50, 150, 250, 370];
const TRACK_Y = 9;

/**
 * Write · Test · Simulate → Deploy, drawn as one SVG.
 *
 * One drawing rather than four bordered boxes, because the loop under the
 * first three is the whole statement — they repeat until the contract is
 * right, and Deploy happens once, after a break, and costs money.
 *
 * The SVG is decoration: transparent buttons sit over it, so tooltips, focus
 * rings, `aria-current` and `disabled` behave as they do anywhere else.
 */
export function RailTrack({ stops }: { stops: Stop[] }) {
  return (
    <div className="relative h-[52px] w-[420px] shrink-0">
      <svg
        aria-hidden
        viewBox="0 0 420 52"
        className="absolute inset-0 h-full w-full"
      >
        <line x1={X[0]} y1={TRACK_Y} x2={X[2]} y2={TRACK_Y}
              stroke="var(--accent-2)" strokeOpacity={0.5} strokeWidth={2} />
        <line x1={268} y1={TRACK_Y} x2={326} y2={TRACK_Y}
              stroke="var(--accent-2)" strokeOpacity={0.28} strokeWidth={2} strokeDasharray="2 6" />
        <path d={`M338 ${TRACK_Y} l-10 -6 v12 z`} fill="var(--accent-2)" fillOpacity={0.55} />

        {/* The loop: these three repeat. A drawing, not a control. */}
        <path d="M10 43 V48 H134" fill="none" stroke="var(--accent-2)" strokeOpacity={0.85} strokeWidth={2} />
        <path d="M166 48 H290 V43" fill="none" stroke="var(--accent-2)" strokeOpacity={0.85} strokeWidth={2} />
        <text x={150} y={48} textAnchor="middle" dominantBaseline="middle"
              fontSize={11} fill="var(--accent-2)" fillOpacity={0.85}>↺</text>

        {stops.map((stop, index) => {
          const cx = X[index]!;
          const mark = railMark(stop.tone);
          return (
            <g key={stop.id} opacity={stop.barred ? 0.4 : 1}>
              {stop.here && <circle cx={cx} cy={TRACK_Y} r={11} fill="var(--accent-2)" fillOpacity={0.22} />}
              <rect x={cx - 6} y={TRACK_Y - 6} width={12} height={12}
                    transform={`rotate(45 ${cx} ${TRACK_Y})`}
                    fill={mark.fill} stroke={mark.stroke} strokeWidth={2} />
              <text x={cx} y={27} textAnchor="middle" fontSize={11.5}
                    fill={stop.here ? "var(--text)" : "var(--dim)"}>
                {stop.label}
              </text>
              <text x={cx} y={39} textAnchor="middle" fontSize={11}
                    fontFamily="JetBrains Mono, ui-monospace, monospace"
                    fill={stop.tone === "good" ? "var(--green)"
                        : stop.tone === "bad" ? "var(--mag)"
                        : stop.here ? "var(--accent-2)" : "var(--dim)"}
                    className="hidden lg:block">
                {stop.fact}
              </text>
            </g>
          );
        })}
      </svg>

      {stops.map((stop, index) => (
        <Tooltip key={stop.id}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={stop.go}
              disabled={!stop.go}
              aria-current={stop.here ? "page" : undefined}
              style={{ left: `${((X[index]! - 50) / 420) * 100}%`, width: `${(100 / 420) * 100}%` }}
              className="motion-control absolute top-0 h-full focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)] disabled:cursor-default"
            >
              <span className="sr-only">
                {stop.label} — {stop.fact}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {stop.label}
            {stop.hint ? ` — ${stop.hint}` : ""}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
```

- [ ] **Step 6: Hand the rail's data to the drawing**

In `rail.tsx`, keep everything down to and including `ignoredNote`. Replace the returned JSX and the whole `RailCell` function with:

```tsx
  return (
    <div className="flex shrink-0 items-center" role="group" aria-label="Workflow">
      <RailTrack
        stops={cells.map((cell) => ({
          id: cell.id,
          label: cell.label,
          fact: cell.content.fact,
          tone: cell.content.tone,
          here: here(cell.id),
          barred: !cell.go,
          hint:
            (cell.content.hint ??
              (!cell.go ? "needs a contract that compiles" : "")) +
            (cell.id === "write" ? ignoredNote : ""),
          go: cell.go,
        }))}
      />
    </div>
  );
```

The compile pulse (`pulsing`) goes on the Write stop's fact: pass `compiling` through as a fifth field if you keep it, or drop the `motion-pulse` — do **not** leave a prop threaded that nothing reads.

- [ ] **Step 7: Verify**

```bash
bun test
bunx tsc --noEmit -p tsconfig.json 2>&1 | grep -E "rail"
bun run build
```
Expected: 593 passing (590 + 3), no rail type errors, successful build.

Visual check, in **all four climates** (switch via the theme control): the track spans the header's right side; the three repeating stages sit on a line with a bracket and `↺` beneath, Deploy after a dashed break. A compiling contract shows a green diamond, a broken one a magenta diamond, a stage with no answer a hollow one — **never a filled diamond for an unknown fact**. The stage you are on has a halo and a brighter label. Barred Deploy is at 40% and does not respond. Below `lg` the facts disappear and the stops still navigate. Nothing overflows the 60px header.

- [ ] **Step 8: Commit**

```bash
git add apps/studio/src/features/workflow
git commit -m "feat(studio): the rail becomes a track you can read

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>"
```

---

## Self-Review

**Spec coverage:** Decision 1 → Tasks 2–5 and 7. Decision 2 (`SurfaceToolbar`, 44px, three slots, file ops as icons right) → Task 1, applied in 2–5. Decision 3 (the per-surface inventory) → Tasks 2, 3, 4, 5, one row each. Decision 4 (the track, bracket, tone-carrying diamond, `lg` rule) → Task 8. Decision 5 (step vocabulary, `Step instruction` only in asm, `Next block` behind a divider) → Task 5. Decision 6 (name stays, explanation in two places) → Task 6. Deletions list → Task 7. The spec's testing section → the `railMark` tests in Task 8 and the guard in Task 7; `rail-cells.test.ts` is untouched and must keep passing, which every task's `bun test` checks.

**Placeholders:** none. Every code step carries the code; every verification step carries the command and the expected output.

**Type consistency:** `railMark` returns `{ fill, stroke }` in Task 8 Step 3 and is consumed as `mark.fill` / `mark.stroke` in Step 5. `Stop` is defined in `rail-track.tsx` and built in `rail.tsx` with exactly those fields. `SurfaceToolbar`'s three props (`verbs`, `context`, `readout`) are the same three names in Tasks 2, 3, 4 and 5. `ToolbarButton` takes `weight`, `onClick`, `disabled`, `title` everywhere it appears. `SIMULATOR_MODEL` is defined once in Task 6 and used by both components in that file.

**One judgement left to the implementer, deliberately:** Task 6 says to follow `devtools-help.tsx`'s actual popover idiom if it differs from the `<details>` markup written here. Matching the existing idiom outranks the sample.
