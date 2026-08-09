# Debugger Two Views + Detachable Live Ledger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the debugger's right panel into a `[Contract Status | Ledger Status]` toggle, make the ledger a vertical reusable view, and add a ⧉ pop-out that mirrors the ledger live in a separate browser tab via `BroadcastChannel`.

**Architecture:** A new `ledger-broadcast.ts` provides an injectable-channel host/subscribe pair. `LedgerView` is extracted from the bottom dock into a vertical, reusable component. `DebugSidePanel` wraps the `[Contract|Ledger]` toggle. `debug-view.tsx` creates a ledger host, publishes on start/forge/reset, and opens `/debug/ledger` (a bare route rendering `LedgerLivePage` that subscribes to the channel). The bottom dock keeps only Console + Emitted Txs.

**Tech Stack:** Bun + `bun:test`, React 19, react-router, `BroadcastChannel`, Tailwind.

**Working directory:** `apps/studio` (paths below relative to it). Branch: `development`.

**Gates:**
- Logic tests: `bun test src/features/simulator`
- App transpile: `bun run build`
- Targeted typecheck: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/simulator\|pages/ledger"` — the **only** acceptable pre-existing errors are the monaco `IStandaloneCodeEditor` "not assignable" ones in `asm-view.tsx` and `debug-view.tsx` (duplicate monaco install). Anything else is real.

---

## File Structure

**New:**
- `src/features/simulator/ledger-broadcast.ts` — `ChannelLike`, `LedgerHost`, `createLedgerHost`, `subscribeLedger`.
- `src/features/simulator/ledger-broadcast.test.ts` — protocol tests (fake bus).
- `src/features/simulator/ui/ledger-view.tsx` — vertical, reusable ledger view (optional pop-out button).
- `src/features/simulator/ui/debug-side-panel.tsx` — `[Contract|Ledger]` toggle wrapping `InspectorPanel` / `LedgerView`.
- `src/pages/ledger/ledger-live-page.tsx` — bare popped-out page.

**Modify:**
- `src/features/simulator/ui/bottom-dock.tsx` — drop `Ledger`/`Balance` tabs + `ledger` prop; keep `Console` + `Emitted Txs`.
- `src/features/simulator/ui/debug-view.tsx` — use `DebugSidePanel`; ledger host + publish + pop-out; stop passing `ledger` to `BottomDock`.
- `src/App.tsx` — add the bare `"/debug/ledger"` route.

---

### Task 1: Ledger broadcast module

**Files:**
- Create: `src/features/simulator/ledger-broadcast.ts`
- Test: `src/features/simulator/ledger-broadcast.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/features/simulator/ledger-broadcast.test.ts`:

```ts
import { describe, it, expect } from "bun:test";
import { createLedgerHost, subscribeLedger, type ChannelLike } from "./ledger-broadcast";
import type { LedgerState } from "./engine/engine.types";

// A synchronous in-memory bus: postMessage delivers to every *other* open channel.
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

const L = (block: number): LedgerState => ({ currentBlock: block, accounts: [], transactions: [] });

describe("ledger-broadcast", () => {
  it("a subscriber that connects after a publish receives the latest snapshot", () => {
    const bus = makeBus();
    const host = createLedgerHost(bus);
    host.publish(L(1));
    let received: LedgerState | null = null;
    subscribeLedger((l) => (received = l), bus);
    expect(received).toEqual(L(1));
  });

  it("later publishes reach the subscriber", () => {
    const bus = makeBus();
    const host = createLedgerHost(bus);
    let received: LedgerState | null = null;
    subscribeLedger((l) => (received = l), bus);
    host.publish(L(5));
    expect(received).toEqual(L(5));
  });

  it("unsubscribe stops delivery", () => {
    const bus = makeBus();
    const host = createLedgerHost(bus);
    let count = 0;
    const off = subscribeLedger(() => count++, bus);
    host.publish(L(1));
    off();
    host.publish(L(2));
    expect(count).toBe(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun test src/features/simulator/ledger-broadcast.test.ts`
Expected: FAIL ("Cannot find module './ledger-broadcast'").

- [ ] **Step 3: Implement the module**

Create `src/features/simulator/ledger-broadcast.ts`:

```ts
import type { LedgerState } from "./engine/engine.types";

export interface ChannelLike {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export interface LedgerHost {
  publish(ledger: LedgerState): void;
  close(): void;
}

type BroadcastMsg = { type: "ledger"; ledger: LedgerState } | { type: "request" };

const CHANNEL = "smartc-ledger";
const supported = (): boolean => typeof BroadcastChannel !== "undefined";
const defaultChannel = (): ChannelLike => new BroadcastChannel(CHANNEL) as unknown as ChannelLike;

/** Debugger tab: broadcasts ledger snapshots and answers late subscribers' requests. */
export function createLedgerHost(makeChannel: () => ChannelLike = defaultChannel): LedgerHost {
  if (makeChannel === defaultChannel && !supported()) return { publish() {}, close() {} };
  const ch = makeChannel();
  let latest: LedgerState | null = null;
  ch.onmessage = (ev) => {
    const m = ev.data as BroadcastMsg;
    if (m && m.type === "request" && latest) ch.postMessage({ type: "ledger", ledger: latest } as BroadcastMsg);
  };
  return {
    publish(ledger) {
      latest = ledger;
      ch.postMessage({ type: "ledger", ledger } as BroadcastMsg);
    },
    close() {
      ch.close();
    },
  };
}

/** Popped-out tab: requests the current ledger on start and gets every update. */
export function subscribeLedger(
  cb: (ledger: LedgerState) => void,
  makeChannel: () => ChannelLike = defaultChannel,
): () => void {
  if (makeChannel === defaultChannel && !supported()) return () => {};
  const ch = makeChannel();
  ch.onmessage = (ev) => {
    const m = ev.data as BroadcastMsg;
    if (m && m.type === "ledger") cb(m.ledger);
  };
  ch.postMessage({ type: "request" } as BroadcastMsg);
  return () => ch.close();
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun test src/features/simulator/ledger-broadcast.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/studio/src/features/simulator/ledger-broadcast.ts apps/studio/src/features/simulator/ledger-broadcast.test.ts
git commit -m "feat(sim): cross-tab ledger broadcast (host + subscribe)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Vertical LedgerView + DebugSidePanel

**Files:**
- Create: `src/features/simulator/ui/ledger-view.tsx`
- Create: `src/features/simulator/ui/debug-side-panel.tsx`

> No component-test harness exists (repo tests are `bun:test` logic only). Gate = targeted typecheck of the new files + `bun run build`; behaviour verified manually in Task 3/5.

- [ ] **Step 1: Create the vertical LedgerView**

Create `src/features/simulator/ui/ledger-view.tsx`:

```tsx
import type { LedgerState } from "../engine/engine.types";

/**
 * Vertical, reusable ledger view (committed chain state). Shows a pop-out button
 * only when `onPopOut` is provided (i.e. inside the debugger, not on the popped page).
 */
export function LedgerView({ ledger, onPopOut }: { ledger: LedgerState | null; onPopOut?: () => void }) {
  return (
    <div className="flex flex-col h-full text-xs font-mono">
      <div className="flex items-center justify-between px-2 py-1 border-b shrink-0">
        <span className="font-medium">Ledger · block {ledger?.currentBlock ?? 0}</span>
        {onPopOut && (
          <button
            className="border rounded px-2 py-0.5 font-sans"
            onClick={onPopOut}
            title="Open the ledger in a separate, live-updating browser tab"
          >
            ⧉ pop out
          </button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-2">
        {!ledger && <div className="opacity-50">— no ledger —</div>}
        {ledger && (
          <>
            <div className="mb-1 opacity-60 uppercase tracking-wide text-[10px]">Accounts</div>
            {ledger.accounts.length === 0 && <div className="opacity-50">— none —</div>}
            <table className="border-collapse mb-3">
              <tbody>
                {ledger.accounts.map((a) => (
                  <tr key={a.id}>
                    <td className="pr-3">{a.id}</td>
                    <td className="pr-3 text-right">{a.balance}</td>
                    <td className="opacity-70">{a.tokens.map((t) => `${t.asset}×${t.quantity}`).join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mb-1 opacity-60 uppercase tracking-wide text-[10px]">Transactions</div>
            {ledger.transactions.length === 0 && <div className="opacity-50">— none —</div>}
            {ledger.transactions.map((t, i) => (
              <div key={i}>
                #{t.block} · tx {t.txId} · {t.sender} → {t.recipient} : {t.amount}
                {t.message ? ` · "${t.message}"` : ""}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
```

> Note: tokens are per-account, so they render as a column in the Accounts table (covers "which tokens/assets"); no separate always-empty Tokens section.

- [ ] **Step 2: Create the DebugSidePanel toggle**

Create `src/features/simulator/ui/debug-side-panel.tsx`:

```tsx
import { useState } from "react";
import type { DebugState, LedgerState } from "../engine/engine.types";
import { InspectorPanel } from "./inspector-panel";
import { LedgerView } from "./ledger-view";

type View = "contract" | "ledger";

export function DebugSidePanel({
  state,
  ledger,
  onRemoveBreakpoint,
  onPopOut,
}: {
  state: DebugState | null;
  ledger: LedgerState | null;
  onRemoveBreakpoint: (line: number) => void;
  onPopOut?: () => void;
}) {
  const [view, setView] = useState<View>("contract");
  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex border-b shrink-0">
        {(["contract", "ledger"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={"flex-1 px-2 py-1 " + (view === v ? "bg-blue-500/20 font-medium" : "opacity-70")}
          >
            {v === "contract" ? "Contract Status" : "Ledger Status"}
          </button>
        ))}
      </div>
      <div className="flex-1 min-h-0">
        {view === "contract" ? (
          <InspectorPanel state={state} onRemoveBreakpoint={onRemoveBreakpoint} />
        ) : (
          <LedgerView ledger={ledger} onPopOut={onPopOut} />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Typecheck the new files**

Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "ledger-view\|debug-side-panel"`
Expected: no output (no type errors in the new files).

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/features/simulator/ui/ledger-view.tsx apps/studio/src/features/simulator/ui/debug-side-panel.tsx
git commit -m "feat(sim): vertical LedgerView + Contract|Ledger side-panel toggle

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Wire the side panel + ledger host + pop-out; trim the dock

**Files:**
- Modify: `src/features/simulator/ui/bottom-dock.tsx`
- Modify: `src/features/simulator/ui/debug-view.tsx`

- [ ] **Step 1: Trim the bottom dock**

Replace the entire contents of `src/features/simulator/ui/bottom-dock.tsx`:

```tsx
import { useState } from "react";
import type { DebugState } from "../engine/engine.types";

type Tab = "console" | "txs";

export function BottomDock({ state }: { state: DebugState | null }) {
  const [tab, setTab] = useState<Tab>("console");
  const tabs: { id: Tab; label: string }[] = [
    { id: "console", label: "Console" },
    { id: "txs", label: `Emitted Txs (${state?.emittedTx.length ?? 0})` },
  ];
  return (
    <div className="h-[150px] shrink-0 border-t flex flex-col text-xs">
      <div className="flex border-b shrink-0">
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
            <div>
              status: {state?.status ?? "ready"} · step {state?.steps ?? 0} · block {state?.currentBlock ?? 0}
            </div>
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
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Swap the imports in debug-view**

In `src/features/simulator/ui/debug-view.tsx`, replace the `InspectorPanel` import with `DebugSidePanel` and add the ledger-host import. Change:

```ts
import { InspectorPanel } from "./inspector-panel";
```

to:

```ts
import { DebugSidePanel } from "./debug-side-panel";
import { createLedgerHost, type LedgerHost } from "../ledger-broadcast";
```

- [ ] **Step 3: Add the ledger-host ref + effects + pop-out**

In `DebugSession`, add a host ref next to the other refs (after `controllerRef`):

```ts
  const ledgerHostRef = useRef<LedgerHost | null>(null);
```

Add these effects and handler after the existing `useEffect`s that publish/clear debug memory (before `useDebugDecorations`):

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

- [ ] **Step 4: Use DebugSidePanel and trim the dock call**

In `src/features/simulator/ui/debug-view.tsx`, replace the right-panel `InspectorPanel` block:

```tsx
        <div ref={panelRef} style={{ width: panelWidth }} className="shrink-0 border-l overflow-hidden">
          <InspectorPanel
            state={state}
            onRemoveBreakpoint={(line) => {
              if (controllerRef.current) setState(controllerRef.current.toggleBreakpoint(line));
            }}
          />
        </div>
```

with:

```tsx
        <div ref={panelRef} style={{ width: panelWidth }} className="shrink-0 border-l overflow-hidden">
          <DebugSidePanel
            state={state}
            ledger={ledger}
            onRemoveBreakpoint={(line) => {
              if (controllerRef.current) setState(controllerRef.current.toggleBreakpoint(line));
            }}
            onPopOut={canPopOut ? onPopOut : undefined}
          />
        </div>
```

Then change the dock line:

```tsx
      <BottomDock state={state} ledger={ledger} />
```

to:

```tsx
      <BottomDock state={state} />
```

- [ ] **Step 5: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds.

Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "features/simulator"`
Expected: only the pre-existing monaco `IStandaloneCodeEditor` errors in `debug-view.tsx` and `asm-view.tsx`. No errors mentioning `bottom-dock`, `debug-side-panel`, `ledger-view`, or `ledger-broadcast`.

- [ ] **Step 6: Commit**

```bash
git add apps/studio/src/features/simulator/ui/bottom-dock.tsx apps/studio/src/features/simulator/ui/debug-view.tsx
git commit -m "feat(sim): right panel Contract|Ledger toggle + live ledger host; slim dock

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: Popped-out live ledger route

**Files:**
- Create: `src/pages/ledger/ledger-live-page.tsx`
- Modify: `src/App.tsx`

- [ ] **Step 1: Create the live page**

Create `src/pages/ledger/ledger-live-page.tsx`:

```tsx
import { useEffect, useState } from "react";
import type { LedgerState } from "@/features/simulator/engine/engine.types";
import { subscribeLedger } from "@/features/simulator/ledger-broadcast";
import { LedgerView } from "@/features/simulator/ui/ledger-view";

export function LedgerLivePage() {
  const [ledger, setLedger] = useState<LedgerState | null>(null);
  useEffect(() => subscribeLedger(setLedger), []);
  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center gap-2 h-[30px] px-2 border-b bg-muted text-xs shrink-0">
        <span className="font-medium">⛓ SmartC Ledger</span>
        <span className={ledger ? "text-green-600" : "opacity-50"}>
          {ledger ? "● live" : "waiting for a debug session…"}
        </span>
      </div>
      <div className="flex-1 min-h-0">
        <LedgerView ledger={ledger} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Register the bare route**

In `src/App.tsx`, add the import and a sibling route **outside** the `AppLayout` route (so the page has no sidebar). Add the import:

```tsx
import { LedgerLivePage } from "./pages/ledger/ledger-live-page";
```

Change the `<Routes>` block to:

```tsx
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
          <Route path="/debug/ledger" element={<LedgerLivePage />} />
        </Routes>
```

- [ ] **Step 3: Build + targeted typecheck**

Run: `bun run build`
Expected: build succeeds.

Run: `../../node_modules/.bin/tsc --noEmit -p tsconfig.json 2>&1 | grep "pages/ledger\|App.tsx"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add apps/studio/src/pages/ledger/ledger-live-page.tsx apps/studio/src/App.tsx
git commit -m "feat(sim): bare /debug/ledger route with live-mirrored ledger

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Full simulator test run**

Run: `bun test src/features/simulator`
Expected: PASS, no failures.

- [ ] **Step 2: Full build**

Run: `bun run build`
Expected: build succeeds.

- [ ] **Step 3: Manual browser verification**

`bun run dev`, open a `.smart.c` contract → **Debug**:
- Right panel shows a `[Contract Status | Ledger Status]` toggle. Contract = the existing inspector; Ledger = the vertical accounts + transactions view.
- Bottom dock shows only **Console** + **Emitted Txs**.
- Click **⧉ pop out** in the Ledger view → a new browser tab opens at `/debug/ledger` showing "● live" and the same ledger.
- Step / **⛏ Next Block** in the main tab → the popped-out tab updates live; new transactions appear at the right block.

Then hand off via **superpowers:finishing-a-development-branch**.

---

## Self-Review

**Spec coverage:**
- §3 right-panel `[Contract|Ledger]` toggle → Task 2 (`DebugSidePanel`) + Task 3 (wiring). ✓
- §3 `LedgerView` extracted, vertical, reusable → Task 2. ✓
- §3 bottom dock drops Ledger/Balance, keeps Console/Emitted → Task 3 Step 1. ✓
- §3/§5 `createLedgerHost`/`subscribeLedger` + `ChannelLike` injectable → Task 1. ✓
- §3 bare `/debug/ledger` route + `LedgerLivePage` → Task 4. ✓
- §3 pop-out `window.open(..., "smartc-ledger")` + `BroadcastChannel` guard → Task 3 Step 3. ✓
- §6 publish on start/forge/reset (via the `[ledger]` effect, since all three call `setLedger`) → Task 3 Step 3. ✓
- §7 no-BroadcastChannel guard (hide pop-out; no-op host/subscribe) → Task 1 + Task 3 (`canPopOut`). ✓
- §7 popped tab waiting state → Task 4 Step 1. ✓
- §8 broadcast protocol tests (fake bus: late-subscriber reply, later publish, unsubscribe) → Task 1 Step 1. ✓

**Placeholder scan:** none — every code step is complete.

**Type consistency:** `ChannelLike`/`LedgerHost`/`createLedgerHost`/`subscribeLedger` are defined in Task 1 and imported unchanged in Tasks 3 (`createLedgerHost`, `LedgerHost`) and 4 (`subscribeLedger`). `LedgerView` prop `{ ledger, onPopOut? }` (Task 2) matches its uses in `DebugSidePanel` (Task 2) and `LedgerLivePage` (Task 4, no `onPopOut`). `DebugSidePanel` props `{ state, ledger, onRemoveBreakpoint, onPopOut? }` (Task 2) match the call site (Task 3 Step 4). `BottomDock` loses its `ledger` prop (Task 3 Step 1) and the call site drops it (Task 3 Step 4). The `/debug/ledger` string is identical in the pop-out (Task 3) and the route (Task 4).
```
