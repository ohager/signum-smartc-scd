# SC-Simulator Debugger — Plan 2 (Breakpoints + Continue, Scenario Editor)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add breakpoints + run-to-breakpoint ("Continue") to the SC-Simulator debugger, and let users author run scenarios via a `.scenario.json` JSON editor with live validation.

**Architecture:** Extend the existing `SimulatorEngine` seam (real `ScSimulatorEngine` over `smartc-signum-simulator` + `FakeEngine`) with `toggleBreakpoint` / `continue` and a `breakpoints` field on `DebugState`; the engine already exposes `Simulator.toggleBreakpoint(cLine)` / `runSlotContract()`. Scenarios become a first-class `scenario` file type edited as JSON, validated by the existing pure `scenario-io`.

**Tech Stack:** TypeScript, React 19, `@monaco-editor/react`, `monaco-editor`, `smartc-signum-simulator@^3.1.0`, jotai, Bun.

**Spec:** `docs/superpowers/specs/2026-08-08-sc-simulator-debugger-design.md`
**Engine API reference:** `docs/superpowers/notes/sc-simulator-api.md`
**Builds on:** Plan 1 (walking skeleton), committed `1b9304c`..`10f49f0` on `development`.

**Out of scope (→ Plan 3):** assembly view + source/asm toggle, full inspector tabs (registers/watch/call-stack), bottom dock (console/emitted-txs/balance), filtering compiler-internal vars.

---

## File Structure

```
apps/studio/src/features/simulator/
  engine/engine.types.ts        + toggleBreakpoint/continue on interface; + breakpoints on DebugState   (modify)
  engine/fake-engine.ts         + breakpoints/continue                                                   (modify + test)
  engine/simulator-engine.ts    + breakpoints/continue over the real engine                              (modify + test)
  debug-controller.ts           + toggleBreakpoint/continue relays                                       (modify + test)
  ui/debug-toolbar.tsx          + Continue button                                                         (modify)
  ui/use-debug-decorations.ts   + breakpoint glyphs (takes breakpoints[])                                 (modify)
  ui/debug-view.tsx             + gutter-click toggle + Continue wiring                                   (modify)
  scenario/scenario-editor.tsx  Monaco JSON editor for .scenario.json + live validation + save            (create)
apps/studio/src/features/project/filetype-icons.tsx   + Scenario file type + icon                         (modify)
apps/studio/src/features/smartc-editor/smartc-editor.tsx  + "New Scenario" action                          (modify)
apps/studio/src/pages/files/files-page.tsx            route Scenario → ScenarioEditor                      (modify)
apps/studio/src/index.css                              + .debug-breakpoint glyph                           (modify)
```

Testing: pure/fake cores via `bun test`; the real adapter via a node integration test; UI via `bun run build` + manual smoke. Run tests from repo root: `bun test <path>`; build `cd apps/studio && bun run build`.

---

## Slice 1 — Breakpoints + Continue in the engine, adapter, controller

### Task 1.1: Extend the types

**Files:** Modify `apps/studio/src/features/simulator/engine/engine.types.ts`

- [ ] **Step 1: Add `breakpoints` to `DebugState` and two methods to `SimulatorEngine`.**

In `DebugState`, add a field (after `steps`):
```ts
  steps: number;
  breakpoints: number[]; // source lines (1-based) that have a breakpoint
```
In `SimulatorEngine`, add `continue` (after `stepInto`) and `toggleBreakpoint` (after `reset`):
```ts
  stepInto(): DebugState; // step until the C source line changes (source-level)
  continue(): DebugState; // run until a breakpoint, or the contract finishes/stops
  reset(): DebugState;
  toggleBreakpoint(sourceLine: number): void;
  getState(): DebugState;
```

- [ ] **Step 2: Build (expected to FAIL type-check via bundler on the two engines missing methods — that's fine; the next tasks add them). Skip building until Task 1.3.**

### Task 1.2: FakeEngine — breakpoints + continue (TDD)

**Files:** Modify `apps/studio/src/features/simulator/engine/fake-engine.ts`; Modify `apps/studio/src/features/simulator/engine/fake-engine.test.ts`

- [ ] **Step 1: Add failing tests** (append inside the existing `describe("FakeEngine", ...)` block):
```ts
  it("toggleBreakpoint adds then removes a source line", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.toggleBreakpoint(2);
    expect(e.getState().breakpoints).toContain(2);
    e.toggleBreakpoint(2);
    expect(e.getState().breakpoints).not.toContain(2);
  });

  it("continue runs to the next breakpoint line", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc\nd\ne"); // source lines 1..5
    e.applyScenario(defaultScenario());
    e.toggleBreakpoint(3);
    const s = e.continue();
    expect(s.currentSourceLine).toBe(3);
    expect(s.breakpoints).toContain(3);
  });

  it("continue runs to finished when there is no breakpoint", () => {
    const e = new FakeEngine();
    e.load("a\nb\nc");
    e.applyScenario(defaultScenario());
    expect(e.continue().status).toBe("finished");
  });
```

- [ ] **Step 2: Run — expect FAIL** (`toggleBreakpoint`/`continue` not implemented, `breakpoints` missing).
Run: `bun test apps/studio/src/features/simulator/engine/fake-engine.test.ts`

- [ ] **Step 3: Implement.** In `fake-engine.ts` add a breakpoints set + methods, and include `breakpoints` in `getState`. Full updated file:
```ts
import type { DebugState, SimulatorEngine } from "./engine.types";
import type { ScenarioFile } from "../scenario/scenario.types";

/** Deterministic in-memory engine for testing the controller + UI without the real simulator. */
export class FakeEngine implements SimulatorEngine {
  private lineCount = 1;
  private ptr = 0;
  private steps = 0;
  private finished = false;
  private breakpoints = new Set<number>();

  load(cSource: string, _creatorId?: string): void {
    this.lineCount = Math.max(1, cSource.split("\n").length);
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
    // breakpoints persist across load/reset (like a real debugger)
  }
  applyScenario(_scenario: ScenarioFile): void {
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
  }
  step(): DebugState {
    if (this.ptr < this.lineCount - 1) {
      this.ptr++;
      this.steps++;
    } else {
      this.finished = true;
    }
    return this.getState();
  }
  stepInto(): DebugState {
    return this.step();
  }
  continue(): DebugState {
    while (this.ptr < this.lineCount - 1) {
      this.ptr++;
      this.steps++;
      if (this.breakpoints.has(this.ptr + 1)) return this.getState();
    }
    this.finished = true;
    return this.getState();
  }
  reset(): DebugState {
    this.ptr = 0;
    this.steps = 0;
    this.finished = false;
    return this.getState();
  }
  toggleBreakpoint(sourceLine: number): void {
    if (this.breakpoints.has(sourceLine)) this.breakpoints.delete(sourceLine);
    else this.breakpoints.add(sourceLine);
  }
  getAssembly(): string {
    return "^comment line 1\nFAKE-ASM";
  }
  getState(): DebugState {
    return {
      instructionPointer: this.ptr,
      currentSourceLine: this.ptr + 1,
      memory: { n: String(this.steps), acc: String(this.steps + 1) },
      registers: { A: "0", B: "0" },
      balance: "100_0000_0000",
      emittedTx: [],
      status: this.finished ? "finished" : this.steps === 0 ? "ready" : "running",
      steps: this.steps,
      breakpoints: [...this.breakpoints].sort((a, b) => a - b),
    };
  }
}
```

- [ ] **Step 4: Run — expect PASS** (existing 3 + new 3 = 6).
Run: `bun test apps/studio/src/features/simulator/engine/fake-engine.test.ts`

### Task 1.3: ScSimulatorEngine — breakpoints + continue over the real engine

**Files:** Modify `apps/studio/src/features/simulator/engine/simulator-engine.ts`; Modify `apps/studio/src/features/simulator/engine/simulator-engine.test.ts`

Engine facts (from the notes): `node.Simulator.toggleBreakpoint(cLine)` returns `"ADDED"` / `"REMOVED"` / an error string (dual-mode: C-line since we attach C source); `node.Simulator.runSlotContract()` runs to breakpoint/finish; `node.reset()` (inside `init`) clears breakpoints, so re-apply them after load.

- [ ] **Step 1: Implement.** Add a `breakpointLines` set, re-apply on `init`, add `toggleBreakpoint`/`continue`, and include `breakpoints` in `getState`. Apply these changes to `simulator-engine.ts`:

Add the field near the other private fields:
```ts
  private breakpointLines = new Set<number>();
```
At the end of `init()` (after `if (this.scenario) this.submitScenario();`), re-apply breakpoints (the fresh `SimNode` has none):
```ts
    for (const line of this.breakpointLines) this.node.Simulator.toggleBreakpoint(line);
```
Add the two methods (next to `step`/`stepInto`):
```ts
  continue(): DebugState {
    this.node?.Simulator.runSlotContract();
    return this.getState();
  }

  toggleBreakpoint(sourceLine: number): void {
    if (!this.node) return;
    const result = this.node.Simulator.toggleBreakpoint(sourceLine);
    const r = typeof result === "string" ? result.toUpperCase() : "";
    if (r.includes("ADDED")) this.breakpointLines.add(sourceLine);
    else if (r.includes("REMOVED")) this.breakpointLines.delete(sourceLine);
    // an error like "Line N is not an instruction" leaves the set unchanged
  }
```
In BOTH `getState()` return objects (the real dump branch AND the no-contract fallback), add:
```ts
      breakpoints: [...this.breakpointLines].sort((a, b) => a - b),
```

- [ ] **Step 2: Add integration tests** (append inside the existing `describe(...)` in `simulator-engine.test.ts`). Use a multi-line contract so source lines are distinct; break on the `acc = n + 1;` line. If the exact line differs after you inspect the compiled mapping, adjust `BP_LINE` to a line that is a real instruction.
```ts
  const MULTILINE = [
    "#pragma maxAuxVars 2",
    "long n, acc;",
    "void main() {",
    "  n = 3;",
    "  acc = n + 1;",
    "}",
  ].join("\n");
  const BP_LINE = 5; // 'acc = n + 1;'

  it("toggleBreakpoint records the line in state", () => {
    const e = new ScSimulatorEngine();
    e.load(MULTILINE);
    e.applyScenario(defaultScenario());
    e.toggleBreakpoint(BP_LINE);
    expect(e.getState().breakpoints).toContain(BP_LINE);
  });

  it("continue stops at a breakpoint", () => {
    const e = new ScSimulatorEngine();
    e.load(MULTILINE);
    e.applyScenario(defaultScenario());
    e.toggleBreakpoint(BP_LINE);
    const s = e.continue();
    expect(s.currentSourceLine).toBe(BP_LINE);
  });
```

- [ ] **Step 3: Run — expect PASS.** Iterate `BP_LINE` / the mapping if `continue` doesn't stop where expected (read `getAssembly()` / the notes' `cToAsmMap` behaviour). Do not weaken the intent (continue must stop at a breakpoint line, not run to the end).
Run: `bun test apps/studio/src/features/simulator/engine/simulator-engine.test.ts`

### Task 1.4: DebugController — relays (TDD)

**Files:** Modify `apps/studio/src/features/simulator/debug-controller.ts`; Modify `apps/studio/src/features/simulator/debug-controller.test.ts`

- [ ] **Step 1: Add failing tests** (append inside `describe("DebugController", ...)`):
```ts
  it("toggleBreakpoint returns state with the breakpoint recorded", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb\nc", defaultScenario());
    expect(c.toggleBreakpoint(2).breakpoints).toContain(2);
  });

  it("continue runs to a breakpoint line", () => {
    const c = new DebugController(new FakeEngine());
    c.start("a\nb\nc\nd", defaultScenario());
    c.toggleBreakpoint(3);
    expect(c.continue().currentSourceLine).toBe(3);
  });
```

- [ ] **Step 2: Run — expect FAIL.**
Run: `bun test apps/studio/src/features/simulator/debug-controller.test.ts`

- [ ] **Step 3: Implement.** Add to `DebugController` (after `stepInto`):
```ts
  continue(): DebugState {
    return this.engine.continue();
  }

  toggleBreakpoint(sourceLine: number): DebugState {
    this.engine.toggleBreakpoint(sourceLine);
    return this.engine.getState();
  }
```

- [ ] **Step 4: Run — expect PASS.**
Run: `bun test apps/studio/src/features/simulator/debug-controller.test.ts`

- [ ] **Step 5: Full suite + build + commit.**
Run: `bun test apps/studio/src/features/simulator` (expect all pass), then `cd apps/studio && bun run build` (`✅ Build completed`).
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/engine apps/studio/src/features/simulator/debug-controller.ts apps/studio/src/features/simulator/debug-controller.test.ts
git commit -m "feat(sim): breakpoints + continue in engine, adapter, and controller

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 2 — Breakpoints + Continue UI

### Task 2.1: Continue button in the toolbar

**Files:** Modify `apps/studio/src/features/simulator/ui/debug-toolbar.tsx`

- [ ] **Step 1: Add an `onContinue` prop + button.** Replace the file with:
```tsx
import type { DebugState } from "../engine/engine.types";

interface Props {
  state: DebugState | null;
  onStep: () => void;
  onStepInto: () => void;
  onContinue: () => void;
  onReset: () => void;
  onClose: () => void;
}

export function DebugToolbar({ state, onStep, onStepInto, onContinue, onReset, onClose }: Props) {
  const status = state?.status ?? "ready";
  const done = status === "finished" || status === "error";
  return (
    <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onContinue} disabled={done}>
        ▶ Continue
      </button>
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onStepInto} disabled={done}>
        Step Into
      </button>
      <button className="px-2 py-0.5 border rounded disabled:opacity-40" onClick={onStep} disabled={done}>
        Step (asm)
      </button>
      <button className="px-2 py-0.5 border rounded" onClick={onReset}>Reset</button>
      <span className="ml-auto opacity-70">
        {status} · step {state?.steps ?? 0} · line {state?.currentSourceLine ?? "—"}
        {state && state.breakpoints.length > 0 ? ` · bp ${state.breakpoints.join(",")}` : ""}
      </span>
      <button className="px-2 py-0.5 border rounded" onClick={onClose}>✕ Close</button>
    </div>
  );
}
```

### Task 2.2: Breakpoint glyphs in the decorations hook

**Files:** Modify `apps/studio/src/features/simulator/ui/use-debug-decorations.ts`; Modify `apps/studio/src/index.css`

- [ ] **Step 1: Add a `breakpoints` param and render red glyphs.** Replace `use-debug-decorations.ts` with:
```ts
import { useEffect } from "react";
import type * as Monaco from "monaco-editor";

/** Highlights the current source line and renders breakpoint glyphs in a Monaco editor. */
export function useDebugDecorations(
  editor: Monaco.editor.IStandaloneCodeEditor | null,
  monaco: typeof Monaco | null,
  currentSourceLine: number | null,
  breakpoints: number[],
) {
  useEffect(() => {
    if (!editor || !monaco) return;
    const decorations: Monaco.editor.IModelDeltaDecoration[] = [];
    for (const line of breakpoints) {
      decorations.push({
        range: new monaco.Range(line, 1, line, 1),
        options: { isWholeLine: false, glyphMarginClassName: "debug-breakpoint" },
      });
    }
    if (currentSourceLine && currentSourceLine > 0) {
      decorations.push({
        range: new monaco.Range(currentSourceLine, 1, currentSourceLine, 1),
        options: { isWholeLine: true, className: "debug-current-line", glyphMarginClassName: "debug-current-glyph" },
      });
    }
    const collection = editor.createDecorationsCollection(decorations);
    if (currentSourceLine && currentSourceLine > 0) {
      editor.revealLineInCenterIfOutsideViewport(currentSourceLine);
    }
    return () => collection.clear();
  }, [editor, monaco, currentSourceLine, breakpoints]);
}
```

- [ ] **Step 2: Add the breakpoint glyph CSS** to `apps/studio/src/index.css` (next to the existing `.debug-current-line`):
```css
.debug-breakpoint { background: #e5484d; border-radius: 50%; width: 10px !important; height: 10px !important; margin: 5px 0 0 6px; }
```

### Task 2.3: Wire gutter-click toggle + Continue in the debug view

**Files:** Modify `apps/studio/src/features/simulator/ui/debug-view.tsx`

- [ ] **Step 1: Wire it up.** Make these changes:
1. In `onMount`, after storing refs and `startSession()`, register a glyph-margin click handler:
```ts
    editor.onMouseDown((e) => {
      if (
        e.target.type === monaco.editor.MouseTargetType.GUTTER_GLYPH_MARGIN ||
        e.target.type === monaco.editor.MouseTargetType.GUTTER_LINE_NUMBERS
      ) {
        const line = e.target.position?.lineNumber;
        if (line && controllerRef.current) setState(controllerRef.current.toggleBreakpoint(line));
      }
    });
```
2. Update the `useDebugDecorations` call to pass breakpoints:
```ts
  useDebugDecorations(
    editorRef.current,
    monacoRef.current,
    state?.currentSourceLine ?? null,
    state?.breakpoints ?? [],
  );
```
3. Pass `onContinue` to the toolbar:
```tsx
      <DebugToolbar
        state={state}
        onStep={run(() => controllerRef.current!.step())}
        onStepInto={run(() => controllerRef.current!.stepInto())}
        onContinue={run(() => controllerRef.current!.continue())}
        onReset={run(() => controllerRef.current!.reset())}
        onClose={onClose}
      />
```

- [ ] **Step 2: Build + smoke + commit.**
Run: `cd apps/studio && bun run build` (`✅ Build completed`).
Manual smoke (`bun run dev`): open a `.smart.c`, Debug; click a line's gutter → a red breakpoint dot appears; click **Continue** → execution runs and the current-line highlight lands on the breakpoint line; clicking the gutter again removes the dot; Reset keeps breakpoints; toolbar shows `bp <lines>`.
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/simulator/ui apps/studio/src/index.css
git commit -m "feat(sim): breakpoint gutter toggle, glyphs, and Continue in the debug UI

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Slice 3 — Scenario editor (`.scenario.json` JSON editor + validation + creation)

### Task 3.1: Register a `scenario` file type

**Files:** Modify `apps/studio/src/features/project/filetype-icons.tsx`

- [ ] **Step 1: Add the enum value + icon.** Add `FileCog2Icon` is already imported; add `PlayIcon` to the lucide import, add `Scenario = "scenario"` to `FileTypes`, and map it:
```tsx
import {
  FileTextIcon,
  FileBadgeIcon,
  FileCog2Icon,
  FileDigitIcon,
  FileIcon,
  PlayIcon,
} from "lucide-react";

export enum FileTypes {
  SmartC = "smartc",
  Scenario = "scenario",
  Test = "test",
  Doc = "doc",
  ASM = "asm",
}

export const FileTypeIcons: Record<FileTypes, any> = {
  [FileTypes.SmartC]: FileCog2Icon,
  [FileTypes.Scenario]: PlayIcon,
  [FileTypes.Test]: FileBadgeIcon,
  [FileTypes.Doc]: FileTextIcon,
  [FileTypes.ASM]: FileDigitIcon,
};

export function getFileTypeIcon(type: string) {
  return FileTypeIcons[type as FileTypes] ?? FileIcon;
}
```

### Task 3.2: Scenario editor component

**Files:** Create `apps/studio/src/features/simulator/scenario/scenario-editor.tsx`

- [ ] **Step 1: Implement** a Monaco JSON editor with live validation (reusing the pure `scenario-io`) and save:
```tsx
import Editor, { type OnMount } from "@monaco-editor/react";
import { useCallback, useRef, useState } from "react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import type { File } from "@/lib/file-system";
import { validateScenario } from "./scenario-io";

function validationErrors(text: string): string[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e: any) {
    return ["JSON: " + e.message];
  }
  const r = validateScenario(parsed);
  return r.valid ? [] : r.errors;
}

export function ScenarioEditor({ file }: { file: File }) {
  const fs = useFileSystem();
  const { theme } = useTheme();
  const [content, setContent] = useState(file.content as string);
  const [errors, setErrors] = useState<string[]>(() => validationErrors(file.content as string));
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  const onMount: OnMount = (editor) => {
    editorRef.current = editor;
  };

  const onChange = (value: string | undefined) => {
    const text = value ?? "";
    setContent(text);
    setErrors(validationErrors(text));
  };

  const save = useCallback(async () => {
    if (errors.length > 0) {
      toast.warning("Fix scenario errors before saving");
      return;
    }
    try {
      await fs.saveFile(file.metadata.id, content);
      toast.success("Scenario saved");
    } catch (e: any) {
      toast.error("Could not save: " + e.message);
    }
  }, [content, errors, file.metadata.id]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs">
        <span className="font-medium">Scenario</span>
        <button className="px-2 py-0.5 border rounded" onClick={save} disabled={errors.length > 0}>
          Save
        </button>
        <span className="ml-auto text-red-500">
          {errors.length > 0 ? `${errors.length} error(s): ${errors[0]}` : "valid ✓"}
        </span>
      </div>
      <div className="flex-1">
        <Editor
          height="100%"
          defaultLanguage="json"
          value={content}
          theme={theme === "dark" ? "vs-dark" : "light"}
          onChange={onChange}
          onMount={onMount}
          options={{ minimap: { enabled: false }, fontSize: 14 }}
        />
      </div>
    </div>
  );
}
```

### Task 3.3: Route the `scenario` type in files-page

**Files:** Modify `apps/studio/src/pages/files/files-page.tsx`

- [ ] **Step 1: Import + route.** Add the import:
```ts
import { ScenarioEditor } from "@/features/simulator/scenario/scenario-editor.tsx";
```
In the render block, add a branch alongside the SmartC/ASM ones, and include `Scenario` in the "supported" check so the fallback message doesn't show for it:
```tsx
          {type === FileTypes.SmartC && (
            <SmartCFileEditor key={id} file={file!} />
          )}
          {type === FileTypes.ASM && (
            <AsmFileEditor key={id} file={file!} />
          )}
          {type === FileTypes.Scenario && <ScenarioEditor key={id} file={file!} />}
          {type !== FileTypes.SmartC && type !== FileTypes.ASM && type !== FileTypes.Scenario && (
            <div className="p-4 text-sm text-muted-foreground">
              This file type ("{type}") is no longer supported.
            </div>
          )}
```

### Task 3.4: "New Scenario" action on the SmartC editor

**Files:** Modify `apps/studio/src/features/smartc-editor/smartc-editor.tsx`

- [ ] **Step 1: Add a page-header action that creates a sibling `<baseName>.scenario.json` and opens it.** Mirror the existing Compile/Debug action registration. Add imports:
```ts
import { FilePlus2 } from "lucide-react";
import { defaultScenario, serializeScenario } from "@/features/simulator/scenario/scenario-io";
import { useNavigate } from "react-router";
```
Add `NewScenario = "new-scenario"` to the `ActionType` enum. Get `const navigate = useNavigate();` with the other hooks. Add a `useEffect` mirroring the Debug action:
```tsx
  useEffect(() => {
    addAction({
      id: ActionType.NewScenario,
      tooltip: "Create a run scenario for this contract",
      label: "New Scenario",
      icon: <FilePlus2 className="h-4 w-4" />,
      onClick: async () => {
        const name = `${baseName.toLowerCase()}.scenario.json`;
        const existing = fs.listFolderContents(file.metadata.folderId).files
          .find((f) => f.metadata.name === name);
        if (existing) {
          navigate(`/projects/${file.metadata.folderId}/files/${existing.id}`);
          return;
        }
        const id = await fs.addFile(
          file.metadata.folderId,
          name,
          FileTypes.Scenario,
          serializeScenario(defaultScenario()),
        );
        navigate(`/projects/${file.metadata.folderId}/files/${id}`);
      },
      variant: "default",
    });
    return () => removeAction(ActionType.NewScenario);
  }, [addAction, removeAction, baseName, file.metadata.folderId]);
```
Note: `baseName` is already computed via `useMemo` in this component; ensure this `useEffect` is placed AFTER that `useMemo`. Verify `fs.addFile` returns the new file id (it is used elsewhere as `await fs.addFile(...)`); if it returns something else, capture the created file's id via `fs.listFolderContents` after creation and navigate to that. Match the exact route pattern already used by `FileSidebarItem` / the app's router (`/projects/:projectId/files/:fileId` — use `file.metadata.folderId` as the projectId, consistent with how files are opened elsewhere).

- [ ] **Step 2: Build + smoke + commit.**
Run: `cd apps/studio && bun run build` (`✅ Build completed`), then `bun test apps/studio/src/features/simulator` (still green).
Manual smoke (`bun run dev`): open a `.smart.c`; click **New Scenario** → a `<name>.scenario.json` appears and opens in a JSON editor showing the default scenario; edit it (invalid JSON shows an error + disables Save; valid shows "valid ✓"); Save persists it; open Debug on the contract → it now runs against your edited scenario (sibling `.scenario.json` is picked up).
```bash
cd /Users/oliverhager/Code/signum/signum-smartc-scd
git add apps/studio/src/features/project/filetype-icons.tsx apps/studio/src/features/simulator/scenario/scenario-editor.tsx apps/studio/src/pages/files/files-page.tsx apps/studio/src/features/smartc-editor/smartc-editor.tsx
git commit -m "feat(sim): scenario file type + JSON editor with live validation + New Scenario action

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Done (Plan 2)

Breakpoints (gutter toggle + red glyphs), **Continue** (run-to-breakpoint), and a `.scenario.json` **JSON editor** with live validation + a **New Scenario** creator — wired through the existing `SimulatorEngine` seam and the debug view. `bun test apps/studio/src/features/simulator` green; `bun run build` green.

**Plan 3 (later):** assembly view + source/asm toggle, full inspector tabs (registers / watch / call-stack) with compiler-internal filtering, bottom dock (console / emitted-txs / balance), and a rich scenario **form** on top of the JSON editor.
