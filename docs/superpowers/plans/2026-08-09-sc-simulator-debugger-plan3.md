# SC-Simulator Debugger — Plan 3 (Assembly view, Inspector tabs, Bottom dock)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Round out the debugger UI to the full IDE-standard layout: an assembly view with a source/asm toggle, a tabbed inspector (Variables filtered · Registers · Watch · Breakpoints), and a bottom dock (Console · Emitted Txs · Balance).

**Architecture:** All new UI reads the existing `DebugState` (already carries `instructionPointer`, `registers`, `emittedTx`, `balance`, `breakpoints`, `memory`, `status`). One tiny engine addition: `DebugState.error` (halt/exception text) for the Console. `controller.getAssembly()` already returns the assembly listing for the asm view.

**Tech Stack:** TypeScript, React 19, `@monaco-editor/react`, `monaco-editor`, `smartc-signum-simulator`, Bun.

**Spec:** `docs/superpowers/specs/2026-08-08-sc-simulator-debugger-design.md`
**Builds on:** Plan 1 + Plan 2 (through commit `99ae296` on `development`).

**Out of scope (→ later):** Call stack tab (needs exposing the engine's code-stack frames), time-travel/back-step, rich watch expressions (Watch here pins plain variable names).

---

## File Structure

```
apps/studio/src/features/simulator/
  ui/asm-view.tsx            (create) read-only Monaco showing assembly + current-instruction highlight
  ui/inspector-panel.tsx     (create) tabbed Variables / Registers / Watch / Breakpoints
  ui/bottom-dock.tsx         (create) tabbed Console / Emitted Txs / Balance
  ui/vars.ts                 (create) isInternalVar() pure helper (+ .test.ts)
  ui/debug-toolbar.tsx       (modify) source/asm toggle
  ui/debug-view.tsx          (modify) view mode + asm view + inspector + bottom dock layout
  engine/engine.types.ts     (modify) DebugState.error?: string
  engine/simulator-engine.ts (modify) populate error from the dump
  engine/fake-engine.ts      (modify) error: undefined in getState
```

Testing: `vars.ts` is pure → `bun test`. UI = `bun run build` + manual smoke. Run tests from repo root; build `cd apps/studio && bun run build`.

### ⚠️ Layout note (read before touching `debug-view.tsx`)

`DebugSession` is layout-sensitive and hand-tuned. Because the files-page height chain does not propagate a flex height (that's why editors use an explicit height), adding the **150px bottom dock** in Slice 3 will overflow the viewport if the editor keeps an independent `calc(100vh - …)` height. **Required final structure (Slice 3):** give the `DebugSession` root a single explicit height via the existing `containerRef` machinery — `style={{ height: \`calc(100vh - ${containerTop}px)\` }}` (note: root top, **no** `+30`) — and make the root a `flex flex-col`. Then it distributes cleanly: `DebugToolbar` (`shrink-0`), the center+inspector row (`flex-1 min-h-0`), and `BottomDock` (`shrink-0`, 150px). The source `<Editor>` and `<AsmView>` inside the center use `height="100%"` + `automaticLayout: true` (they now sit in a flex item with a definite height). Integrate the snippets below against the file's *current* state rather than pasting blindly; the end state must match this structure.

---

## Slice 1 — Assembly view + source/asm toggle

### Task 1.1: AsmView component

**Files:** Create `apps/studio/src/features/simulator/ui/asm-view.tsx`

- [ ] **Step 1: Implement** (read-only Monaco showing the assembly, highlighting the current instruction line; `instructionPointer` is 0-based → Monaco line +1):
```tsx
import Editor, { type OnMount } from "@monaco-editor/react";
import { useEffect, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";

export function AsmView({
  assembly,
  currentAsmLine,
  height = "100%",
}: {
  assembly: string;
  currentAsmLine: number;
  height?: string;
}) {
  const { theme } = useTheme();
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<typeof Monaco | null>(null);
  const decoRef = useRef<Monaco.editor.IEditorDecorationsCollection | null>(null);
  const [ready, setReady] = useState(false);

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    setReady(true);
  };

  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const line = currentAsmLine + 1; // 0-based -> 1-based
    decoRef.current?.clear();
    decoRef.current = editor.createDecorationsCollection([
      {
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: true, className: "debug-current-line", glyphMarginClassName: "debug-current-glyph" },
      },
    ]);
    editor.revealLineInCenterIfOutsideViewport(line);
  }, [currentAsmLine, ready]);

  return (
    <Editor
      height={height}
      defaultLanguage="plaintext"
      value={assembly}
      theme={theme === "dark" ? "vs-dark" : "light"}
      options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, lineNumbers: "on", glyphMargin: true, automaticLayout: true }}
      onMount={onMount}
    />
  );
}
```

### Task 1.2: Toolbar source/asm toggle

**Files:** Modify `apps/studio/src/features/simulator/ui/debug-toolbar.tsx`

- [ ] **Step 1: Add `viewMode` + `onViewMode` and a toggle.** Add to `Props`:
```ts
  viewMode: "source" | "asm";
  onViewMode: (mode: "source" | "asm") => void;
```
And render the toggle just before the status `<span className="ml-auto ...">` (so it sits left of the status). Insert:
```tsx
      <span className="mx-1 inline-flex rounded border overflow-hidden">
        <button
          className={"px-2 py-0.5 " + (viewMode === "source" ? "bg-blue-500/30" : "")}
          onClick={() => onViewMode("source")}
        >
          source
        </button>
        <button
          className={"px-2 py-0.5 border-l " + (viewMode === "asm" ? "bg-blue-500/30" : "")}
          onClick={() => onViewMode("asm")}
        >
          asm
        </button>
      </span>
```
Update the destructured params to include `viewMode, onViewMode`.

### Task 1.3: Wire view mode + assembly into DebugSession

**Files:** Modify `apps/studio/src/features/simulator/ui/debug-view.tsx`

- [ ] **Step 1: Add state + assembly capture.** In `DebugSession`, add near the other state:
```ts
  const [viewMode, setViewMode] = useState<"source" | "asm">("source");
  const [assembly, setAssembly] = useState("");
```
Import `AsmView`:
```ts
import { AsmView } from "./asm-view";
```
In `onMount`, right after `setState(controller.start(source, scenario));`, capture the assembly:
```ts
      setAssembly(controller.getAssembly());
```

- [ ] **Step 2: Pass toggle to the toolbar.** Add to `<DebugToolbar>`:
```tsx
        viewMode={viewMode}
        onViewMode={setViewMode}
```

- [ ] **Step 3: Render source or asm in the center pane.** Replace the center editor wrapper (`<div className="flex-1 min-w-0"> <Editor .../> </div>`) so it swaps on `viewMode`. The source `<Editor>` must stay mounted (it owns breakpoints/decorations), so hide it with CSS rather than unmounting; overlay the asm view when active:
```tsx
        <div className="flex-1 min-w-0 relative">
          <div className={viewMode === "asm" ? "hidden" : "h-full"}>
            <Editor
              height="100%"
              defaultLanguage={SMARTC_LANGUAGE_ID}
              value={source}
              theme={theme === "dark" ? "vs-dark" : "light"}
              options={{ readOnly: true, minimap: { enabled: false }, glyphMargin: true, fontSize: 14, automaticLayout: true }}
              onMount={onMount}
            />
          </div>
          {viewMode === "asm" && (
            <div className="h-full">
              <AsmView assembly={assembly} currentAsmLine={state?.instructionPointer ?? 0} />
            </div>
          )}
        </div>
```
(Keep the `<div className="w-[240px] border-l overflow-auto"> <VariablesPanel .../> </div>` sibling unchanged for this slice — the inspector is replaced in Slice 2.)

- [ ] **Step 4: Build + smoke + commit.**
Run: `cd apps/studio && bun run build` (`✅ Build completed`), `bun test apps/studio/src/features/simulator` (24 pass).
Smoke: Debug a contract → toggle **asm** → the generated assembly shows with the current instruction highlighted; **Step (asm)** moves the highlight one instruction at a time; toggle back to **source**; breakpoints still work in source view.
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/ui/asm-view.tsx apps/studio/src/features/simulator/ui/debug-toolbar.tsx apps/studio/src/features/simulator/ui/debug-view.tsx
git commit -m "feat(sim): assembly view with source/asm toggle in the debugger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 2 — Tabbed inspector (Variables · Registers · Watch · Breakpoints)

### Task 2.1 (TDD): internal-var filter

**Files:** Create `apps/studio/src/features/simulator/ui/vars.ts` + `vars.test.ts`

- [ ] **Step 1: Write failing test** (`vars.test.ts`):
```ts
import { describe, it, expect } from "bun:test";
import { isInternalVar } from "./vars";

describe("isInternalVar", () => {
  it("flags compiler registers and ZERO", () => {
    expect(isInternalVar("r0")).toBe(true);
    expect(isInternalVar("r12")).toBe(true);
    expect(isInternalVar("ZERO")).toBe(true);
  });
  it("keeps user variables", () => {
    expect(isInternalVar("n")).toBe(false);
    expect(isInternalVar("currentTx_sender")).toBe(false);
    expect(isInternalVar("_counterTimestamp")).toBe(false); // real, user-usable
  });
});
```
Run: `bun test apps/studio/src/features/simulator/ui/vars.test.ts` → FAIL.

- [ ] **Step 2: Implement** `vars.ts`:
```ts
/** Compiler-internal memory slots not worth showing by default. */
export function isInternalVar(name: string): boolean {
  return /^r\d+$/.test(name) || name === "ZERO";
}
```
Run → PASS (2 tests).

### Task 2.2: InspectorPanel

**Files:** Create `apps/studio/src/features/simulator/ui/inspector-panel.tsx`

- [ ] **Step 1: Implement** a tabbed panel. Variables filters internals (with a "show internals" toggle); Registers lists `state.registers`; Watch pins plain variable names (session-local) and shows their live value; Breakpoints lists `state.breakpoints` with a remove action.
```tsx
import { useState } from "react";
import type { DebugState } from "../engine/engine.types";
import { isInternalVar } from "./vars";

type Tab = "variables" | "registers" | "watch" | "breakpoints";

interface Props {
  state: DebugState | null;
  onRemoveBreakpoint: (line: number) => void;
}

export function InspectorPanel({ state, onRemoveBreakpoint }: Props) {
  const [tab, setTab] = useState<Tab>("variables");
  const [showInternals, setShowInternals] = useState(false);
  const [watched, setWatched] = useState<string[]>([]);
  const [watchInput, setWatchInput] = useState("");

  const memory = state?.memory ?? {};
  const tabs: Tab[] = ["variables", "registers", "watch", "breakpoints"];

  return (
    <div className="flex flex-col h-full w-[260px] border-l text-xs">
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={"flex-1 px-2 py-1 capitalize " + (tab === t ? "bg-blue-500/20 font-medium" : "opacity-70")}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono">
        {tab === "variables" && (
          <>
            {Object.entries(memory)
              .filter(([name]) => !isInternalVar(name))
              .map(([name, value]) => (
                <Row key={name} name={name} value={value} />
              ))}
            <label className="mt-2 flex items-center gap-1 opacity-70 font-sans">
              <input type="checkbox" checked={showInternals} onChange={(e) => setShowInternals(e.target.checked)} />
              show internals
            </label>
            {showInternals &&
              Object.entries(memory)
                .filter(([name]) => isInternalVar(name))
                .map(([name, value]) => <Row key={name} name={name} value={value} muted />)}
          </>
        )}
        {tab === "registers" &&
          Object.entries(state?.registers ?? {}).map(([name, value]) => <Row key={name} name={name} value={value} />)}
        {tab === "watch" && (
          <>
            <form
              className="flex gap-1 mb-2 font-sans"
              onSubmit={(e) => {
                e.preventDefault();
                const v = watchInput.trim();
                if (v && !watched.includes(v)) setWatched([...watched, v]);
                setWatchInput("");
              }}
            >
              <input
                className="flex-1 border rounded px-1 bg-transparent"
                placeholder="variable name"
                value={watchInput}
                onChange={(e) => setWatchInput(e.target.value)}
              />
              <button className="border rounded px-2" type="submit">+</button>
            </form>
            {watched.length === 0 && <div className="opacity-50 font-sans">— add a variable to watch —</div>}
            {watched.map((name) => (
              <div key={name} className="flex justify-between gap-2 group">
                <span>{name}</span>
                <span className="flex gap-2">
                  <span className="opacity-80">{memory[name] ?? "—"}</span>
                  <button className="opacity-0 group-hover:opacity-60" onClick={() => setWatched(watched.filter((w) => w !== name))}>✕</button>
                </span>
              </div>
            ))}
          </>
        )}
        {tab === "breakpoints" && (
          <>
            {(state?.breakpoints ?? []).length === 0 && <div className="opacity-50 font-sans">— none —</div>}
            {(state?.breakpoints ?? []).map((line) => (
              <div key={line} className="flex justify-between gap-2 group">
                <span>line {line}</span>
                <button className="opacity-0 group-hover:opacity-60" onClick={() => onRemoveBreakpoint(line)}>✕</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Row({ name, value, muted }: { name: string; value: string; muted?: boolean }) {
  return (
    <div className={"flex justify-between gap-4 " + (muted ? "opacity-50" : "")}>
      <span>{name}</span>
      <span className="opacity-80">{value}</span>
    </div>
  );
}
```

### Task 2.3: Use InspectorPanel in DebugSession

**Files:** Modify `apps/studio/src/features/simulator/ui/debug-view.tsx`

- [ ] **Step 1: Swap the panel.** Replace the import of `VariablesPanel` with `InspectorPanel`:
```ts
import { InspectorPanel } from "./inspector-panel";
```
Replace the right-hand `<div className="w-[240px] border-l overflow-auto"><VariablesPanel state={state} /></div>` with:
```tsx
        <InspectorPanel
          state={state}
          onRemoveBreakpoint={(line) => {
            if (controllerRef.current) setState(controllerRef.current.toggleBreakpoint(line));
          }}
        />
```
(`toggleBreakpoint` toggles, so calling it on a set breakpoint removes it.) Delete the now-unused `variables-panel.tsx` import; you may leave the file or remove it — remove it and its file since nothing else uses it (`grep -rn variables-panel apps/studio/src` should be empty after).

- [ ] **Step 2: Build + smoke + commit.**
Run: `cd apps/studio && bun run build`, `bun test apps/studio/src/features/simulator` (25 pass now — +1 vars test file), and confirm `grep -rn "variables-panel" apps/studio/src` is empty.
Smoke: inspector shows tabs; Variables hides `r0..`/`ZERO` until "show internals"; Registers shows A/B; Watch: add `n`, see it update per step, ✕ removes it; Breakpoints lists set lines, ✕ removes them.
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git rm apps/studio/src/features/simulator/ui/variables-panel.tsx
git add apps/studio/src/features/simulator/ui/vars.ts apps/studio/src/features/simulator/ui/vars.test.ts apps/studio/src/features/simulator/ui/inspector-panel.tsx apps/studio/src/features/simulator/ui/debug-view.tsx
git commit -m "feat(sim): tabbed inspector (variables filtered, registers, watch, breakpoints)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 3 — Bottom dock (Console · Emitted Txs · Balance) + DebugState.error

### Task 3.1: Add `error` to DebugState + engines

**Files:** Modify `engine/engine.types.ts`, `engine/simulator-engine.ts`, `engine/fake-engine.ts`

- [ ] **Step 1: engine.types** — add to `DebugState` (after `breakpoints`):
```ts
  error?: string; // halt/exception reason, when the contract aborts
```
- [ ] **Step 2: simulator-engine** — in `getState()`'s real-dump branch, add:
```ts
      error: d.exception || (d.ERR != null ? `ERR ${d.ERR}` : undefined),
```
(Add the same key to the no-contract fallback return with value `undefined`.)
- [ ] **Step 3: fake-engine** — add `error: undefined,` to its `getState()` return.
- [ ] **Step 4:** Run `bun test apps/studio/src/features/simulator` — still green (no assertion depends on the new optional field; adding an optional field is compatible).

### Task 3.2: BottomDock component

**Files:** Create `apps/studio/src/features/simulator/ui/bottom-dock.tsx`

- [ ] **Step 1: Implement:**
```tsx
import { useState } from "react";
import type { DebugState } from "../engine/engine.types";

type Tab = "console" | "txs" | "balance";

export function BottomDock({ state }: { state: DebugState | null }) {
  const [tab, setTab] = useState<Tab>("console");
  const tabs: { id: Tab; label: string }[] = [
    { id: "console", label: "Console" },
    { id: "txs", label: `Emitted Txs (${state?.emittedTx.length ?? 0})` },
    { id: "balance", label: "Balance" },
  ];
  return (
    <div className="h-[150px] border-t flex flex-col text-xs">
      <div className="flex border-b">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={"px-3 py-1 " + (tab === t.id ? "bg-blue-500/20 font-medium" : "opacity-70")}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-auto p-2 font-mono">
        {tab === "console" && (
          <>
            <div>status: {state?.status ?? "ready"} · step {state?.steps ?? 0}</div>
            {state?.error && <div className="text-red-500">error: {state.error}</div>}
          </>
        )}
        {tab === "txs" && (
          <>
            {(state?.emittedTx ?? []).length === 0 && <div className="opacity-50">— none —</div>}
            {(state?.emittedTx ?? []).map((tx, i) => (
              <div key={i}>
                → {tx.recipient} : {tx.amount}
                {tx.message ? ` · "${tx.message}"` : ""}
              </div>
            ))}
          </>
        )}
        {tab === "balance" && <div>contract balance: {state?.balance ?? "0"}</div>}
      </div>
    </div>
  );
}
```

### Task 3.3: Mount the dock in DebugSession

**Files:** Modify `apps/studio/src/features/simulator/ui/debug-view.tsx`

- [ ] **Step 1: Import + render below the editor/inspector row.** Add:
```ts
import { BottomDock } from "./bottom-dock";
```
Restructure `DebugSession`'s return so the editor+inspector row is `flex-1` and the dock sits under it:
```tsx
  return (
    <div className="flex flex-col h-full">
      <DebugToolbar
        state={state}
        onStep={run(() => controllerRef.current!.step())}
        onStepInto={run(() => controllerRef.current!.stepInto())}
        onContinue={run(() => controllerRef.current!.continue())}
        onReset={run(() => controllerRef.current!.reset())}
        viewMode={viewMode}
        onViewMode={setViewMode}
        onClose={onClose}
      />
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex-1 min-w-0 relative">
          <div className={viewMode === "asm" ? "hidden" : "h-full"}>
            <Editor
              height="100%"
              defaultLanguage={SMARTC_LANGUAGE_ID}
              value={source}
              theme={theme === "dark" ? "vs-dark" : "light"}
              options={{ readOnly: true, minimap: { enabled: false }, glyphMargin: true, fontSize: 14, automaticLayout: true }}
              onMount={onMount}
            />
          </div>
          {viewMode === "asm" && (
            <div className="h-full">
              <AsmView assembly={assembly} currentAsmLine={state?.instructionPointer ?? 0} />
            </div>
          )}
        </div>
        <InspectorPanel
          state={state}
          onRemoveBreakpoint={(line) => {
            if (controllerRef.current) setState(controllerRef.current.toggleBreakpoint(line));
          }}
        />
      </div>
      <BottomDock state={state} />
    </div>
  );
```

- [ ] **Step 2: Build + smoke + commit.**
Run: `cd apps/studio && bun run build`, `bun test apps/studio/src/features/simulator` (25 pass).
Smoke: below the editor a dock shows Console (status/step, red error line on a failing contract), Emitted Txs (a `sendAmount` contract lists the queued tx), Balance (contract balance). Everything updates as you step.
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/engine apps/studio/src/features/simulator/ui/bottom-dock.tsx apps/studio/src/features/simulator/ui/debug-view.tsx
git commit -m "feat(sim): bottom dock (console, emitted txs, balance) + DebugState.error

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done (Plan 3)

Full IDE-standard debugger layout: source/asm toggle with a live assembly view, a tabbed inspector (Variables filtered · Registers · Watch · Breakpoints), and a bottom dock (Console · Emitted Txs · Balance). `bun test apps/studio/src/features/simulator` green; `bun run build` green.

**Later (Plan 4, if wanted):** Call stack tab (expose the engine's code-stack frames), richer watch expressions, time-travel/back-step, and aligning the simulator's bundled compiler with the editor's `smartc-signum-compiler` version.
