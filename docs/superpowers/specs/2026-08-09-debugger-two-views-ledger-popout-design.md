# Debugger Two Views + Detachable Live Ledger — Design

**Date:** 2026-08-09
**Status:** Approved (design), pending implementation plan
**Context:** SC-Simulator step-debugger (Phase 2). Follows the scenario-v2 + ledger work
(commits `e28fa69`..`0d800a0`). This iteration reworks how the ledger is presented.

---

## 1. Problem

The ledger currently lives in the 150px bottom dock (horizontal, cramped). It reads as
"only the current block" even though the transaction history is cumulative. Two
conceptually distinct views are entangled:

- **Contract Status** — state *inside* the current execution: variables, registers,
  watch, breakpoints (and later call-stack / asm).
- **Blockchain / Ledger Status** — committed chain state: accounts (balances + tokens)
  and the full transaction history across all forged blocks.

The user wants the ledger to be readable (vertical, roomy) and, ideally, viewable **live
in a separate browser tab** while debugging.

## 2. Goal

Layout direction **B** (chosen): the right debugger panel gets a `[Contract | Ledger]`
toggle; the Ledger is a vertical, full-height view; a **⧉ pop-out** opens the same ledger
in a **separate browser tab** that mirrors it **live** via `BroadcastChannel`.

## 3. Architecture

- **Right panel** (in `DebugSession`) renders a new `DebugSidePanel` that owns a
  `view: "contract" | "ledger"` toggle:
  - `contract` → the existing `InspectorPanel` (unchanged).
  - `ledger` → the new `LedgerView` + a `⧉ pop out` button in its header.
- **`LedgerView`** is extracted from `bottom-dock.tsx` into its own reusable,
  **vertical** component (Block header → Accounts → Transactions → Tokens). Used both
  in-panel and on the popped-out page.
- **Bottom dock** drops the `Ledger` and `Balance` tabs (both now live in the ledger
  panel); it keeps `Console` + `Emitted Txs`.
- **`ledger-broadcast.ts`** provides same-origin cross-tab sync over a
  `BroadcastChannel("smartc-ledger")`:
  - `createLedgerHost(makeChannel?)` — the debugger tab: `publish(ledger)` broadcasts a
    snapshot and caches it as "latest"; it also answers `request` messages by
    re-broadcasting the latest (so a tab opened later immediately gets state).
  - `subscribeLedger(cb, makeChannel?)` — the popped-out tab: sends one `request` on
    start and invokes `cb` on every `ledger` message. Returns an unsubscribe.
  - `makeChannel` is an injectable factory (`() => ChannelLike`) defaulting to
    `new BroadcastChannel("smartc-ledger")`, so the protocol is unit-testable with a
    synchronous fake bus.
- **Popped-out page** is a **bare route** `"/debug/ledger"` (a sibling of the
  `AppLayout` route, so no sidebar) rendering `LedgerLivePage`, which subscribes and
  renders a full-height `LedgerView` with a "live" header and a "waiting for a debug
  session…" empty state.
- **Pop-out action**: `window.open("/debug/ledger", "smartc-ledger")` (named target, so
  repeated clicks reuse/focus the same tab).

## 4. Components / Files

**New:**
- `src/features/simulator/ledger-broadcast.ts` — `ChannelLike`, `createLedgerHost`,
  `subscribeLedger`.
- `src/features/simulator/ledger-broadcast.test.ts` — protocol tests with a fake bus.
- `src/features/simulator/ui/ledger-view.tsx` — vertical, reusable ledger view.
- `src/features/simulator/ui/debug-side-panel.tsx` — `[Contract | Ledger]` toggle +
  view switch.
- `src/pages/ledger/ledger-live-page.tsx` — the popped-out live page.

**Modify:**
- `src/features/simulator/ui/bottom-dock.tsx` — remove `Ledger`/`Balance` tabs + the
  `ledger` prop; keep `Console` + `Emitted Txs`.
- `src/features/simulator/ui/debug-view.tsx` — replace the right-panel `InspectorPanel`
  with `DebugSidePanel`; create a ledger host on mount, `publish` on start/forge/reset,
  `close` on unmount; wire `onPopOut`; stop passing `ledger` to `BottomDock`.
- `src/App.tsx` — add the bare `"/debug/ledger"` route.

## 5. Component contracts

```ts
// ledger-broadcast.ts
export interface ChannelLike {
  postMessage(msg: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}
export interface LedgerHost {
  publish(ledger: LedgerState): void;
  close(): void;
}
export function createLedgerHost(makeChannel?: () => ChannelLike): LedgerHost;
export function subscribeLedger(cb: (ledger: LedgerState) => void, makeChannel?: () => ChannelLike): () => void;
```

```tsx
// ledger-view.tsx
function LedgerView(props: { ledger: LedgerState | null; onPopOut?: () => void }): JSX.Element;
// debug-side-panel.tsx
function DebugSidePanel(props: {
  state: DebugState | null;
  ledger: LedgerState | null;
  onRemoveBreakpoint: (line: number) => void;
  onPopOut: () => void;
}): JSX.Element;
```

## 6. Data flow

```
Debugger tab
  getLedger() on start/forge/reset → setLedger(state)
     → DebugSidePanel (Ledger view) renders it
     → host.publish(ledger)  ──BroadcastChannel("smartc-ledger")──►
Popped-out tab (/debug/ledger)
  subscribeLedger(cb) → on mount posts {request}
     ◄── host answers {ledger: latest}
     ◄── every publish delivers {ledger}
  cb(ledger) → setLedger → LedgerView (full height, "live")
```

## 7. Error handling

- **No `BroadcastChannel`** (very old browser): guard with
  `typeof BroadcastChannel !== "undefined"`. If absent, the pop-out button is hidden and
  the in-panel ledger still works. `createLedgerHost`/`subscribeLedger` become no-ops.
- **Popped tab opened before/without a session**: shows "waiting for a debug session…"
  until the first `ledger` message.
- **Debugger tab closed**: the popped tab simply keeps the last snapshot (no error).

## 8. Testing

- **`ledger-broadcast.test.ts` (bun:test):** wire two `ChannelLike` fakes to a shared
  synchronous in-memory bus. Assert: (a) `subscribeLedger` that connects *after* the host
  published receives the latest snapshot (request→reply); (b) a later `publish` reaches
  the subscriber; (c) the returned unsubscribe stops delivery and `close()` releases the
  channel.
- **`LedgerView`, `DebugSidePanel`, `LedgerLivePage`:** presentational/wiring — no unit
  test harness in this repo; verified by `bun run build` + manual browser check
  (toggle Contract⇄Ledger; pop out; confirm the separate tab updates live on step/forge).

## 9. Out of scope (deferred)

- Call-stack tab and richer Watch expressions (separate later work).
- Token holdings/transfers authored in the scenario (ledger only *displays* tokens).
- Persisting the popped-out tab across full page reloads / multiple concurrent debug
  sessions (last-writer-wins on one channel is sufficient).
