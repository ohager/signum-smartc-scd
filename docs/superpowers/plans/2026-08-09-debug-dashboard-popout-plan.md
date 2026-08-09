# Debug Dashboard Popout + Theming + Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the ledger-only pop-out with one **⧉ Pop out** (in the toolbar) that opens a theme-aware, professional, two-column **Debug Dashboard** (Contract Status | Ledger Status) mirroring the session live; remove the redundant bottom Console/dock.

**Architecture:** Generalise the broadcast to a combined `DebugSnapshot {state, ledger}` (`debug-broadcast.ts`). Add styling primitives + a read-only `ContractStatusView`; restyle `LedgerView`. The debug view publishes snapshots on every state/ledger change and opens `/debug/dashboard` (a bare route rendering `DebugDashboardPage`). Hoist `ThemeProvider` to `App` so the popout follows the theme. Delete the bottom dock (Emitted Txs → inspector tab; error → toolbar).

**Tech Stack:** Bun + `bun:test`, React 19, react-router, next-themes, `BroadcastChannel`, Tailwind (shadcn tokens).

**Working directory:** `apps/studio` (paths relative to it). Branch: `development`.

**Gates:**
- Logic: `bun test src/features/simulator`
- Transpile: `bun run build`
- Targeted typecheck: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/simulator\|pages/debug\|App.tsx"` — the **only** acceptable pre-existing errors are the monaco `IStandaloneCodeEditor` "not assignable" ones in `asm-view.tsx` and `debug-view.tsx`. `noUnusedLocals` is off, so transient unused imports are fine.

---

## File Structure

**New:** `debug-broadcast.ts` (+test), `ui/debug-primitives.tsx`, `ui/contract-status-view.tsx`, `pages/debug/debug-dashboard-page.tsx`.
**Modify:** `ui/ledger-view.tsx`, `ui/inspector-panel.tsx`, `ui/debug-side-panel.tsx`, `ui/debug-toolbar.tsx`, `ui/debug-view.tsx`, `App.tsx`, `components/ui/layout/app-layout.tsx`.
**Delete (Task 7):** `ledger-broadcast.ts` (+test), `pages/ledger/ledger-live-page.tsx`, `ui/bottom-dock.tsx`.

---

### Task 1: Combined DebugSnapshot broadcast

**Files:**
- Create: `src/features/simulator/debug-broadcast.ts`
- Test: `src/features/simulator/debug-broadcast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/simulator/debug-broadcast.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createDebugHost, subscribeDebug, type ChannelLike, type DebugSnapshot } from "./debug-broadcast";

function makeBus(): () => ChannelLike {
  const channels: FakeChannel[] = [];
  class FakeChannel implements ChannelLike {
    onmessage: ((ev: { data: unknown }) => void) | null = null;
    closed = false;
    constructor() {
      channels.push(this);
    }
    postMessage(msg: unknown) {
      for (const c of channels) if (c !== this && !c.closed) c.onmessage?.({ data: msg });
    }
    close() {
      this.closed = true;
    }
  }
  return () => new FakeChannel();
}

const snap = (block: number): DebugSnapshot => ({
  state: {
    instructionPointer: 0,
    currentSourceLine: 1,
    currentBlock: block,
    memory: {},
    registers: {},
    balance: "0",
    emittedTx: [],
    status: "running",
    steps: 0,
    breakpoints: [],
  },
  ledger: { currentBlock: block, accounts: [], transactions: [] },
});

describe("debug-broadcast", () => {
  it("a subscriber that connects after a publish receives the latest snapshot", () => {
    const bus = makeBus();
    const host = createDebugHost(bus);
    host.publish(snap(1));
    const got: DebugSnapshot[] = [];
    subscribeDebug((s) => got.push(s), bus);
    expect(got[got.length - 1]).toEqual(snap(1));
  });

  it("later publishes reach the subscriber", () => {
    const bus = makeBus();
    const host = createDebugHost(bus);
    const got: DebugSnapshot[] = [];
    subscribeDebug((s) => got.push(s), bus);
    host.publish(snap(5));
    expect(got[got.length - 1]).toEqual(snap(5));
  });

  it("unsubscribe stops delivery", () => {
    const bus = makeBus();
    const host = createDebugHost(bus);
    let count = 0;
    const off = subscribeDebug(() => count++, bus);
    host.publish(snap(1));
    off();
    host.publish(snap(2));
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/simulator/debug-broadcast.test.ts`
Expected: FAIL ("Cannot find module './debug-broadcast'").

- [ ] **Step 3: Implement the module**

Create `src/features/simulator/debug-broadcast.ts`:

```ts
import type { DebugState, LedgerState } from "./engine/engine.types";

export interface ChannelLike {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export interface DebugSnapshot {
  state: DebugState;
  ledger: LedgerState;
}

export interface DebugHost {
  publish(snapshot: DebugSnapshot): void;
  close(): void;
}

type BroadcastMsg = { type: "snapshot"; snapshot: DebugSnapshot } | { type: "request" };

const CHANNEL = "smartc-debug";
const supported = (): boolean => typeof BroadcastChannel !== "undefined";
const defaultChannel = (): ChannelLike => new BroadcastChannel(CHANNEL) as unknown as ChannelLike;

/** Debugger tab: broadcasts snapshots and answers late subscribers' requests. */
export function createDebugHost(makeChannel: () => ChannelLike = defaultChannel): DebugHost {
  if (makeChannel === defaultChannel && !supported()) return { publish() {}, close() {} };
  const ch = makeChannel();
  let latest: DebugSnapshot | null = null;
  ch.onmessage = (ev) => {
    const m = ev.data as BroadcastMsg;
    if (m && m.type === "request" && latest) ch.postMessage({ type: "snapshot", snapshot: latest } as BroadcastMsg);
  };
  return {
    publish(snapshot) {
      latest = snapshot;
      ch.postMessage({ type: "snapshot", snapshot } as BroadcastMsg);
    },
    close() {
      ch.close();
    },
  };
}

/** Popped-out tab: requests the current snapshot on start and gets every update. */
export function subscribeDebug(
  cb: (snapshot: DebugSnapshot) => void,
  makeChannel: () => ChannelLike = defaultChannel,
): () => void {
  if (makeChannel === defaultChannel && !supported()) return () => {};
  const ch = makeChannel();
  ch.onmessage = (ev) => {
    const m = ev.data as BroadcastMsg;
    if (m && m.type === "snapshot") cb(m.snapshot);
  };
  ch.postMessage({ type: "request" } as BroadcastMsg);
  return () => ch.close();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/simulator/debug-broadcast.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/simulator/debug-broadcast.ts apps/studio/src/features/simulator/debug-broadcast.test.ts
git commit -m "feat(sim): combined DebugSnapshot broadcast (state + ledger)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Styling primitives + ContractStatusView + restyle LedgerView

**Files:**
- Create: `src/features/simulator/ui/debug-primitives.tsx`
- Create: `src/features/simulator/ui/contract-status-view.tsx`
- Modify: `src/features/simulator/ui/ledger-view.tsx`

- [ ] **Step 1: Create the primitives**

Create `src/features/simulator/ui/debug-primitives.tsx`:

```tsx
import type { ReactNode } from "react";

export function Pill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "accent" | "error" }) {
  const cls =
    tone === "accent"
      ? "bg-primary text-primary-foreground border-transparent"
      : tone === "error"
        ? "bg-red-600 text-white border-transparent"
        : "text-muted-foreground";
  return <span className={"text-[10px] px-2 py-0.5 rounded-full border " + cls}>{children}</span>;
}

export function Section({ label, count, children }: { label: string; count?: number; children: ReactNode }) {
  return (
    <div className="px-3 py-2 border-b">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</span>
        {count !== undefined && (
          <span className="text-[10px] px-1.5 rounded bg-muted text-foreground font-semibold">{count}</span>
        )}
      </div>
      {children}
    </div>
  );
}

export function KVTable({ rows }: { rows: { k: string; v: string; muted?: boolean }[] }) {
  if (rows.length === 0) return <div className="opacity-50 text-xs font-mono">— none —</div>;
  return (
    <table className="w-full border-collapse text-[11px] font-mono">
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.k + i} className={i % 2 ? "bg-muted/40" : ""}>
            <td className={"px-1.5 py-0.5 " + (r.muted ? "opacity-60" : "")}>{r.k}</td>
            <td className="px-1.5 py-0.5 text-right">{r.v}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 2: Create ContractStatusView (read-only, stacked)**

Create `src/features/simulator/ui/contract-status-view.tsx`:

```tsx
import type { DebugState } from "../engine/engine.types";
import { isInternalVar } from "./vars";
import { Section, KVTable } from "./debug-primitives";

/** Read-only stacked contract state for the popped-out dashboard. */
export function ContractStatusView({ state }: { state: DebugState | null }) {
  const vars = Object.entries(state?.memory ?? {}).filter(([n]) => !isInternalVar(n));
  const regs = Object.entries(state?.registers ?? {});
  const bps = state?.breakpoints ?? [];
  const txs = state?.emittedTx ?? [];
  return (
    <div className="h-full overflow-auto">
      <Section label="Variables" count={vars.length}>
        <KVTable rows={vars.map(([k, v]) => ({ k, v }))} />
      </Section>
      <Section label="Registers" count={regs.length}>
        <KVTable rows={regs.map(([k, v]) => ({ k, v }))} />
      </Section>
      <Section label="Breakpoints" count={bps.length}>
        {bps.length === 0 ? (
          <div className="opacity-50 text-xs font-mono">— none —</div>
        ) : (
          <div className="font-mono text-[11px]">{bps.map((l) => `line ${l}`).join(", ")}</div>
        )}
      </Section>
      <Section label="Emitted Txs" count={txs.length}>
        <KVTable rows={txs.map((t) => ({ k: `→ ${t.recipient}${t.message ? ` "${t.message}"` : ""}`, v: t.amount }))} />
      </Section>
    </div>
  );
}
```

- [ ] **Step 3: Restyle LedgerView (keep onPopOut for now)**

Replace the entire contents of `src/features/simulator/ui/ledger-view.tsx`:

```tsx
import type { LedgerState } from "../engine/engine.types";
import { Section } from "./debug-primitives";

export function LedgerView({ ledger, onPopOut }: { ledger: LedgerState | null; onPopOut?: () => void }) {
  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-1.5 border-b shrink-0">
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          Ledger · block {ledger?.currentBlock ?? 0}
        </span>
        {onPopOut && (
          <button
            className="border rounded px-2 py-0.5 font-sans"
            onClick={onPopOut}
            title="Open the live debug dashboard in a separate browser tab"
          >
            ⧉ pop out
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto">
        {!ledger && <div className="p-3 opacity-50">— no ledger —</div>}
        {ledger && (
          <>
            <Section label="Accounts" count={ledger.accounts.length}>
              {ledger.accounts.length === 0 ? (
                <div className="opacity-50 font-mono text-[11px]">— none —</div>
              ) : (
                <table className="w-full border-collapse text-[11px] font-mono">
                  <tbody>
                    {ledger.accounts.map((a, i) => (
                      <tr key={a.id} className={i % 2 ? "bg-muted/40" : ""}>
                        <td className="px-1.5 py-0.5">{a.id}</td>
                        <td className="px-1.5 py-0.5 text-right">{a.balance}</td>
                        <td className="px-1.5 py-0.5 text-muted-foreground">
                          {a.tokens.map((t) => `${t.asset}×${t.quantity}`).join(", ") || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>
            <Section label="Transactions" count={ledger.transactions.length}>
              {ledger.transactions.length === 0 ? (
                <div className="opacity-50 font-mono text-[11px]">— none —</div>
              ) : (
                <div className="font-mono text-[11px] space-y-0.5">
                  {ledger.transactions.map((t, i) => (
                    <div key={i}>
                      #{t.block} · tx {t.txId} · {t.sender} → {t.recipient} : {t.amount}
                      {t.message ? ` · "${t.message}"` : ""}
                    </div>
                  ))}
                </div>
              )}
            </Section>
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Typecheck + build**

Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "debug-primitives\|contract-status-view\|ledger-view"`
Expected: no output.
Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/simulator/ui/debug-primitives.tsx apps/studio/src/features/simulator/ui/contract-status-view.tsx apps/studio/src/features/simulator/ui/ledger-view.tsx
git commit -m "feat(sim): styling primitives + ContractStatusView; restyle LedgerView

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Emitted Txs tab in the in-app inspector

**Files:**
- Modify: `src/features/simulator/ui/inspector-panel.tsx`

- [ ] **Step 1: Add the Emitted Txs tab**

In `src/features/simulator/ui/inspector-panel.tsx`, change the `Tab` type and tab list to include `emitted`:

```ts
type Tab = "variables" | "registers" | "watch" | "breakpoints" | "emitted";
```

```ts
  const tabs: Tab[] = ["variables", "registers", "watch", "breakpoints", "emitted"];
```

Then add its render branch after the `breakpoints` block (before the closing `</div>` of the scroll container):

```tsx
        {tab === "emitted" && (
          <>
            {(state?.emittedTx ?? []).length === 0 && <div className="opacity-50 font-sans">— none —</div>}
            {(state?.emittedTx ?? []).map((tx, i) => (
              <div key={i} className="flex justify-between gap-4">
                <span>→ {tx.recipient}{tx.message ? ` · "${tx.message}"` : ""}</span>
                <span className="opacity-80">{tx.amount}</span>
              </div>
            ))}
          </>
        )}
```

> The tab label renders via the existing `capitalize` button; "emitted" shows as "Emitted". Acceptable.

- [ ] **Step 2: Typecheck + build**

Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "inspector-panel"`
Expected: no output.
Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Commit**

```bash
git add apps/studio/src/features/simulator/ui/inspector-panel.tsx
git commit -m "feat(sim): Emitted Txs tab in the debug inspector

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Dashboard page + route + theme hoist

**Files:**
- Create: `src/pages/debug/debug-dashboard-page.tsx`
- Modify: `src/App.tsx`
- Modify: `src/components/ui/layout/app-layout.tsx`

- [ ] **Step 1: Create the dashboard page**

Create `src/pages/debug/debug-dashboard-page.tsx`:

```tsx
import { useEffect, useState } from "react";
import { subscribeDebug, type DebugSnapshot } from "@/features/simulator/debug-broadcast";
import { ContractStatusView } from "@/features/simulator/ui/contract-status-view";
import { LedgerView } from "@/features/simulator/ui/ledger-view";
import { Pill } from "@/features/simulator/ui/debug-primitives";

export function DebugDashboardPage() {
  const [snap, setSnap] = useState<DebugSnapshot | null>(null);
  useEffect(() => subscribeDebug(setSnap), []);
  const s = snap?.state;
  const status = s?.status ?? "ready";
  return (
    <div className="h-screen flex flex-col bg-background text-foreground">
      <div className="flex items-center gap-2 h-9 px-3 border-b bg-card shrink-0">
        <span className="font-bold tracking-wide">⛓ SmartC Debug</span>
        {s && <Pill tone={status === "error" ? "error" : status === "running" ? "accent" : "default"}>{status}</Pill>}
        {s && <Pill>block {s.currentBlock}</Pill>}
        {s && <Pill>step {s.steps}</Pill>}
        {s?.error && <Pill tone="error">{s.error}</Pill>}
        <span className={"ml-auto text-xs font-semibold " + (snap ? "text-green-600" : "opacity-50")}>
          {snap ? "● live" : "waiting for a debug session…"}
        </span>
      </div>
      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 border-r flex flex-col">
          <div className="px-3 py-1.5 border-b bg-card text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            Contract Status
          </div>
          <div className="flex-1 min-h-0">
            <ContractStatusView state={snap?.state ?? null} />
          </div>
        </div>
        <div className="flex-1 min-w-0 flex flex-col">
          <div className="px-3 py-1.5 border-b bg-card text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
            Ledger Status
          </div>
          <div className="flex-1 min-h-0">
            <LedgerView ledger={snap?.ledger ?? null} />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Hoist ThemeProvider + add the route in App.tsx**

Replace the entire contents of `src/App.tsx`:

```tsx
import "./index.css";
import { AppLayout } from "./components/ui/layout/app-layout";
import { jotaiStore } from "./stores/jotai-store";
import { Provider as JotaiProvider } from "jotai";
import { BrowserRouter, Route, Routes } from "react-router";
import { ThemeProvider } from "next-themes";
import { FilesPage } from "./pages/files/files-page";
import { DebugDashboardPage } from "./pages/debug/debug-dashboard-page";
export function App() {
  return (
    <JotaiProvider store={jotaiStore}>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              <Route
                path="/"
                element={
                  <div>
                    <h1>TO DO: some home page</h1>
                  </div>
                }
              />
              <Route path="/projects/:projectId/files/:fileId" element={<FilesPage />} />
            </Route>
            <Route path="/debug/dashboard" element={<DebugDashboardPage />} />
          </Routes>
        </BrowserRouter>
      </ThemeProvider>
    </JotaiProvider>
  );
}
```

- [ ] **Step 3: Remove the now-duplicate ThemeProvider from AppLayout**

In `src/components/ui/layout/app-layout.tsx`, remove the `ThemeProvider` wrapper (it is now provided by `App`). Change the import line:

```tsx
import { ThemeProvider } from "next-themes";
```

to remove it, and change the return block from:

```tsx
  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
      <div className="h-screen flex flex-col">
        <TooltipProvider>
          <SidebarProvider style={{ "--sidebar-width": sidebarWidth } as CSSProperties}>
            <LeftSidebar />
            <SidebarResizer onCommit={setSidebarWidth} />
            <Outlet />
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </div>
    </ThemeProvider>
  );
```

to:

```tsx
  return (
    <div className="h-screen flex flex-col">
      <TooltipProvider>
        <SidebarProvider style={{ "--sidebar-width": sidebarWidth } as CSSProperties}>
          <LeftSidebar />
          <SidebarResizer onCommit={setSidebarWidth} />
          <Outlet />
        </SidebarProvider>
        <Toaster />
      </TooltipProvider>
    </div>
  );
```

- [ ] **Step 4: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds.
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "pages/debug\|App.tsx\|app-layout"`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/pages/debug/debug-dashboard-page.tsx apps/studio/src/App.tsx apps/studio/src/components/ui/layout/app-layout.tsx
git commit -m "feat(sim): themed /debug/dashboard route (two-column live dashboard)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Rewire debug-view — snapshot host, toolbar pop-out, remove dock

**Files:**
- Modify: `src/features/simulator/ui/debug-toolbar.tsx`
- Modify: `src/features/simulator/ui/debug-side-panel.tsx`
- Modify: `src/features/simulator/ui/ledger-view.tsx`
- Modify: `src/features/simulator/ui/debug-view.tsx`

- [ ] **Step 1: Toolbar — pop-out button, error + pill status**

Replace the entire contents of `src/features/simulator/ui/debug-toolbar.tsx`:

```tsx
import type { DebugState } from "../engine/engine.types";
import { Pill } from "./debug-primitives";

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
}: Props) {
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
      <button
        className="px-2 py-0.5 border rounded"
        onClick={onForgeNextBlock}
        title="Forge the next block and deliver its scheduled transactions"
      >
        ⛏ Next Block
      </button>
      <button className="px-2 py-0.5 border rounded" onClick={onReset}>
        Reset
      </button>
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
      {onPopOut && (
        <button
          className="px-2 py-0.5 border rounded"
          onClick={onPopOut}
          title="Open a live debug dashboard in a separate browser tab"
        >
          ⧉ Pop out
        </button>
      )}
      <span className="ml-auto flex items-center gap-1.5">
        <Pill>block {state?.currentBlock ?? 0}</Pill>
        <Pill tone={status === "error" ? "error" : status === "running" ? "accent" : "default"}>{status}</Pill>
        <Pill>step {state?.steps ?? 0}</Pill>
        {state?.currentSourceLine != null && <Pill>line {state.currentSourceLine}</Pill>}
        {state?.error && <Pill tone="error">{state.error}</Pill>}
      </span>
      <button className="px-2 py-0.5 border rounded" onClick={onClose}>
        ✕ Close
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Side panel — drop onPopOut**

In `src/features/simulator/ui/debug-side-panel.tsx`, remove `onPopOut` from the props and the `LedgerView` call. Change the props destructuring/type:

```tsx
export function DebugSidePanel({
  state,
  ledger,
  onRemoveBreakpoint,
}: {
  state: DebugState | null;
  ledger: LedgerState | null;
  onRemoveBreakpoint: (line: number) => void;
}) {
```

and the ledger branch:

```tsx
          <LedgerView ledger={ledger} />
```

- [ ] **Step 3: LedgerView — drop onPopOut**

In `src/features/simulator/ui/ledger-view.tsx`, change the signature and remove the pop-out button. Change:

```tsx
export function LedgerView({ ledger, onPopOut }: { ledger: LedgerState | null; onPopOut?: () => void }) {
```

to:

```tsx
export function LedgerView({ ledger }: { ledger: LedgerState | null }) {
```

and delete the `{onPopOut && ( … )}` button block inside the header (leaving just the `Ledger · block N` label).

- [ ] **Step 4: debug-view — snapshot host, toolbar pop-out, remove dock**

In `src/features/simulator/ui/debug-view.tsx`:

(a) Replace the broadcast import:

```ts
import { createLedgerHost, type LedgerHost } from "../ledger-broadcast";
```

with:

```ts
import { createDebugHost, type DebugHost } from "../debug-broadcast";
```

(b) Remove the `BottomDock` import line:

```ts
import { BottomDock } from "./bottom-dock";
```

(c) Remove the `DOCK_HEIGHT` constant:

```ts
const DOCK_HEIGHT = 150;
```

(d) Change the ref type/name:

```ts
  const ledgerHostRef = useRef<LedgerHost | null>(null);
```

to:

```ts
  const debugHostRef = useRef<DebugHost | null>(null);
```

(e) Replace the host effects + pop-out block:

```ts
  // Cross-tab ledger host: created once, closed on unmount.
  useEffect(() => {
    ledgerHostRef.current = createLedgerHost();
    return () => ledgerHostRef.current?.close();
  }, []);
  // Mirror the current ledger to any popped-out tab whenever it changes.
  useEffect(() => {
    if (ledger) ledgerHostRef.current?.publish(ledger);
  }, [ledger]);

  const canPopOut = typeof BroadcastChannel !== "undefined";
  const onPopOut = () => window.open("/debug/ledger", "smartc-ledger");
```

with:

```ts
  // Cross-tab debug host: created once, closed on unmount.
  useEffect(() => {
    debugHostRef.current = createDebugHost();
    return () => debugHostRef.current?.close();
  }, []);
  // Mirror the current snapshot to any popped-out dashboard whenever it changes.
  useEffect(() => {
    if (state && ledger) debugHostRef.current?.publish({ state, ledger });
  }, [state, ledger]);

  const canPopOut = typeof BroadcastChannel !== "undefined";
  const onPopOut = () => window.open("/debug/dashboard", "smartc-debug");
```

(f) Update the editor-height calc to drop the dock. Change:

```ts
        const newHeight = `calc(100vh - ${containerTop + 30 + DOCK_HEIGHT}px)`;
```

to:

```ts
        const newHeight = `calc(100vh - ${containerTop + 30}px)`;
```

(g) Pass `onPopOut` to the toolbar. In the `<DebugToolbar … />` usage, add the prop (e.g. after `onReset={onReset}`):

```tsx
        onReset={onReset}
        onPopOut={canPopOut ? onPopOut : undefined}
```

(h) Drop `onPopOut` from the `DebugSidePanel` usage:

```tsx
          <DebugSidePanel
            state={state}
            ledger={ledger}
            onRemoveBreakpoint={(line) => {
              if (controllerRef.current) setState(controllerRef.current.toggleBreakpoint(line));
            }}
          />
```

(i) Delete the `<BottomDock state={state} />` line entirely.

- [ ] **Step 5: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds.
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/simulator"`
Expected: only the pre-existing monaco `IStandaloneCodeEditor` errors in `debug-view.tsx` and `asm-view.tsx`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/simulator/ui/debug-toolbar.tsx apps/studio/src/features/simulator/ui/debug-side-panel.tsx apps/studio/src/features/simulator/ui/ledger-view.tsx apps/studio/src/features/simulator/ui/debug-view.tsx
git commit -m "feat(sim): toolbar pop-out to live dashboard; publish snapshots; remove dock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: Remove dead files

**Files:**
- Delete: `src/features/simulator/ledger-broadcast.ts`, `src/features/simulator/ledger-broadcast.test.ts`
- Delete: `src/pages/ledger/ledger-live-page.tsx`
- Delete: `src/features/simulator/ui/bottom-dock.tsx`

- [ ] **Step 1: Confirm nothing imports them**

Run: `grep -rn "ledger-broadcast\|ledger-live-page\|bottom-dock" src --include="*.ts" --include="*.tsx"`
Expected: no matches.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/studio/src/features/simulator/ledger-broadcast.ts apps/studio/src/features/simulator/ledger-broadcast.test.ts apps/studio/src/pages/ledger/ledger-live-page.tsx apps/studio/src/features/simulator/ui/bottom-dock.tsx
```

- [ ] **Step 3: Full test + build + typecheck**

Run: `bun test src/features/simulator`
Expected: PASS (no ledger-broadcast tests; debug-broadcast tests present).
Run: `bun run build`
Expected: build succeeds.
Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/simulator\|pages/"`
Expected: only the pre-existing monaco `IStandaloneCodeEditor` errors in `debug-view.tsx` and `asm-view.tsx`.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(sim): remove ledger-only popout, bottom dock, and old broadcast

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full simulator test run**

Run: `bun test src/features/simulator`
Expected: PASS, no failures.

- [ ] **Step 2: Full build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Manual browser verification**

`bun run dev`, open a `.smart.c` contract → **Debug**:
- Right panel: `[Contract Status | Ledger Status]` toggle (Contract now has an **Emitted Txs** tab). No bottom dock; the editor fills the reclaimed height.
- Toolbar shows pill status (block/status/step/line) and a red pill on error; a **⧉ Pop out** button.
- Click **⧉ Pop out** → a new tab at `/debug/dashboard` shows two columns (Contract Status | Ledger Status), a top bar with pills + "● live".
- Step / **⛏ Next Block** → both columns update live in the popped tab.
- Toggle the app theme (in the main app) and reload/observe the popped tab → it follows dark/light.

Then hand off via **superpowers:finishing-a-development-branch**.

---

## Self-Review

**Spec coverage:**
- §3 combined `DebugSnapshot` broadcast (`createDebugHost`/`subscribeDebug`) → Task 1. ✓
- §3 publish on every state/ledger change → Task 5 Step 4(e). ✓
- §3 toolbar `⧉ Pop out` → `/debug/dashboard` → Task 5 Steps 1, 4(e,g). ✓
- §3 two-column themed `DebugDashboardPage` → Task 4 Step 1. ✓
- §3 ThemeProvider hoisted to App → Task 4 Steps 2, 3. ✓
- §3 styling primitives applied (LedgerView, ContractStatusView, toolbar, dashboard) → Tasks 2, 4, 5. ✓
- §3 remove dock; Emitted Txs → inspector tab; error → toolbar → Task 3, Task 5 Steps 1, 4(b,i). ✓
- §4 deletions → Task 6. ✓
- §8 broadcast protocol tests (fake bus, snapshot payload) → Task 1. ✓

**Placeholder scan:** none.

**Type consistency:** `DebugSnapshot`/`DebugHost`/`createDebugHost`/`subscribeDebug`/`ChannelLike` defined in Task 1, imported unchanged in Task 4 (`subscribeDebug`, `DebugSnapshot`) and Task 5 (`createDebugHost`, `DebugHost`). `Pill`/`Section`/`KVTable` defined in Task 2 and used in Tasks 2 (`Section`, `KVTable`), 4 (`Pill`), 5 (`Pill`). `ContractStatusView({state})` (Task 2) matches its use in Task 4. `LedgerView` prop narrows from `{ledger, onPopOut?}` (Task 2) to `{ledger}` (Task 5 Step 3), and every caller (`DebugSidePanel` Task 5 Step 2, `DebugDashboardPage` Task 4 — no `onPopOut`) matches. `DebugToolbar` gains optional `onPopOut` (Task 5 Step 1); the call site passes it (Task 5 Step 4g). The pop-out URL `/debug/dashboard` and window name `smartc-debug` match between Task 5 (opener) and Task 4 (route).
```
