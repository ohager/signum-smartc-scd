# Debug Dashboard: Combined Live Popout + Theming + Polish — Design

**Date:** 2026-08-09
**Status:** Approved (design), pending implementation plan
**Context:** SC-Simulator step-debugger (Phase 2). Iterates on the two-view + ledger
popout work (commits `56ca999`..`4b3a06e`). Approved via Visual Companion mockup
(dark + light).

---

## 1. Problem

The current pop-out mirrors only the ledger, is visually spartan, ignores the app
theme, and the bottom **Console** tab is now redundant (status/step/block live in the
toolbar). The user wants a single, professional, **theme-aware** pop-out that shows
**both** Contract Status and Ledger Status as **two live columns**.

## 2. Goal

- One **⧉ Pop out** (in the toolbar) opens a combined, live **Debug Dashboard** in a
  separate browser tab: two columns — **Contract Status** (left) and **Ledger Status**
  (right) — both updating live via `BroadcastChannel`.
- The dashboard and the in-app debug panels get a **professional** visual pass
  (top bar with status pills, card sections with uppercase labels + count badges, zebra
  rows, right-aligned monospace values).
- The pop-out is **theme-aware** (follows the app's dark/light).
- **Remove** the bottom dock: the redundant **Console** goes away, **Emitted Txs** moves
  into Contract Status, and the halt/exception **error** shows in the toolbar.

## 3. Architecture

- **Broadcast a combined snapshot.** Generalise the broadcast module (rename
  `ledger-broadcast.ts` → `debug-broadcast.ts`) to carry
  `DebugSnapshot { state: DebugState; ledger: LedgerState }`:
  - `createDebugHost(makeChannel?)` — `publish(snapshot)` broadcasts + caches "latest";
    answers `request` with the latest.
  - `subscribeDebug(cb, makeChannel?)` — requests current on start, invokes `cb` on
    every snapshot. Injectable `ChannelLike` factory (unchanged) for tests.
- **Debug view** creates the host on mount and `publish({ state, ledger })` whenever
  `state` or `ledger` changes (so the Contract column updates every step and the Ledger
  column every forge). The **⧉ Pop out** button lives in the **toolbar** and opens
  `window.open("/debug/dashboard", "smartc-debug")`.
- **Popout page** `DebugDashboardPage` (bare route `/debug/dashboard`): a top bar
  (brand, status pills `running`/`block N`/`step N`, red error pill, `● live`) + two
  columns: `ContractStatusView` (read-only) | `LedgerView`. Subscribes via
  `subscribeDebug`; shows a "waiting for a debug session…" state until the first snapshot.
- **Theme-aware popout.** Hoist `next-themes` `ThemeProvider` from `AppLayout` up to
  `App` so it wraps **all** routes (layout + bare dashboard). Both tabs share the
  `theme` localStorage key, so the popout follows the user's dark/light choice.
- **Professional styling primitives** (`ui/debug-primitives.tsx`): `Pill`, `Section`
  (uppercase label + optional count badge + children), `KVTable` (zebra rows,
  right-aligned monospace values). Used by `LedgerView`, `InspectorPanel`,
  `ContractStatusView`, `DebugDashboardPage`, and the toolbar.
- **Remove the bottom dock.** Delete `bottom-dock.tsx` and its use; add an **Emitted
  Txs** tab to the in-app `InspectorPanel`; show `state.error` (red) in the toolbar.

## 4. Components / Files

**New:**
- `src/features/simulator/debug-broadcast.ts` (replaces `ledger-broadcast.ts`) —
  `ChannelLike`, `DebugSnapshot`, `DebugHost`, `createDebugHost`, `subscribeDebug`.
- `src/features/simulator/debug-broadcast.test.ts` (replaces the ledger test).
- `src/features/simulator/ui/debug-primitives.tsx` — `Pill`, `Section`, `KVTable`.
- `src/features/simulator/ui/contract-status-view.tsx` — read-only stacked Contract
  Status (Variables, Registers, Breakpoints, Emitted Txs) from `DebugState`.
- `src/pages/debug/debug-dashboard-page.tsx` (replaces `pages/ledger/ledger-live-page.tsx`).

**Modify:**
- `src/features/simulator/ui/ledger-view.tsx` — restyle with primitives; drop the
  `onPopOut` prop (pop-out moves to the toolbar).
- `src/features/simulator/ui/inspector-panel.tsx` — add an **Emitted Txs** tab; restyle
  with primitives.
- `src/features/simulator/ui/debug-side-panel.tsx` — drop `onPopOut` (toolbar owns it).
- `src/features/simulator/ui/debug-toolbar.tsx` — add a **⧉ Pop out** button, a red
  **error** indicator, and pill-styled status.
- `src/features/simulator/ui/debug-view.tsx` — publish combined snapshots; remove
  `BottomDock`; wire the toolbar pop-out; use `DebugSidePanel` without `onPopOut`.
- `src/App.tsx` — hoist `ThemeProvider`; add the bare `/debug/dashboard` route; remove
  the old `/debug/ledger` route.
- `src/components/ui/layout/app-layout.tsx` — remove its `ThemeProvider` (hoisted).

**Delete:**
- `src/features/simulator/ui/bottom-dock.tsx`
- `src/features/simulator/ledger-broadcast.ts` / `.test.ts` (renamed)
- `src/pages/ledger/ledger-live-page.tsx` (renamed)

## 5. Component contracts

```ts
// debug-broadcast.ts
export interface DebugSnapshot { state: DebugState; ledger: LedgerState }
export interface DebugHost { publish(s: DebugSnapshot): void; close(): void }
export function createDebugHost(makeChannel?: () => ChannelLike): DebugHost;
export function subscribeDebug(cb: (s: DebugSnapshot) => void, makeChannel?: () => ChannelLike): () => void;
```

```tsx
// debug-primitives.tsx
function Pill(p: { children: React.ReactNode; tone?: "default" | "accent" | "error" }): JSX.Element;
function Section(p: { label: string; count?: number; children: React.ReactNode }): JSX.Element;
function KVTable(p: { rows: { k: string; v: string; muted?: boolean }[] }): JSX.Element;
// contract-status-view.tsx
function ContractStatusView(p: { state: DebugState | null }): JSX.Element;
```

## 6. Data flow

```
Debugger tab
  step/stepInto/continue/forge/reset → setState (+ setLedger on forge/reset/start)
    → useEffect([state, ledger]) → host.publish({ state, ledger })
        ──BroadcastChannel("smartc-debug")──►
Popout tab (/debug/dashboard, own ThemeProvider via App root)
  subscribeDebug(cb) → posts {request} on mount ◄── host replies {snapshot: latest}
    ◄── every publish delivers {snapshot}
  cb → setSnapshot → top bar + <ContractStatusView state> | <LedgerView ledger>
```

## 7. Error handling

- **No `BroadcastChannel`**: `createDebugHost`/`subscribeDebug` no-op; the toolbar
  pop-out button is hidden (`typeof BroadcastChannel !== "undefined"` guard).
- **Popout before/without a session**: "waiting for a debug session…" until first
  snapshot.
- **Contract halt/exception**: `state.error` shows as a red pill in the toolbar and the
  dashboard top bar.

## 8. Testing

- **`debug-broadcast.test.ts` (bun:test):** fake-bus protocol tests, now with a
  `DebugSnapshot` payload — (a) a subscriber connecting after a publish gets the latest
  snapshot, (b) later publishes reach it, (c) unsubscribe stops delivery.
- **UI (`debug-primitives`, `contract-status-view`, `ledger-view`, `inspector-panel`,
  `debug-toolbar`, `debug-dashboard-page`):** no unit harness in this repo — gated by
  targeted `tsc` + `bun run build`, verified manually (toggle in-app; pop out; confirm
  two live columns; toggle app theme and confirm the popout follows; trigger an error
  and confirm the red indicator).

## 9. Out of scope (deferred)

- Two separate independent pop-outs (one combined dashboard is the approved design).
- A "Watch" column in the popout (Watch stays interactive in the in-app inspector).
- Call-stack tab, richer Watch expressions (separate later work).
- Persisting the popout across full reloads / multiple concurrent sessions
  (last-writer-wins on one channel).
