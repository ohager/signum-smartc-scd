import type { ErrorCode, ToolName, ToolOutcome } from "@smartc-studio/assistant-protocol";
import type { TouchedFile } from "../tools/registry";

export type FeedSummary =
  | { kind: "compile"; ok: boolean }
  | { kind: "tests"; passed: number; total: number }
  | { kind: "lint"; count: number }
  | { kind: "gas"; tooLow: boolean }
  | { kind: "write"; path: string; fileId: string }
  | { kind: "error"; code: ErrorCode }
  | { kind: "plain" };

export interface FeedEntry {
  callId: string;
  at: number;
  tool: ToolName;
  target: string | null;
  status: "running" | "ok" | "error";
  summary: FeedSummary;
  /* Only for entries waiting in `loose` that may still be adopted by a round that has not started yet. */
  projectId?: string | null;
}

export interface FeedRound {
  roundId: string;
  projectId: string;
  startedAt: number;
  endedAt: number | null;
  checkpointId: string;
  entries: FeedEntry[];
}

export interface FeedState {
  rounds: FeedRound[];
  loose: FeedEntry[];
}

export type FeedEvent =
  | { type: "round:start"; roundId: string; projectId: string; checkpointId: string; at: number }
  | { type: "round:end"; roundId: string; at: number }
  | { type: "call:start"; callId: string; tool: ToolName; projectId: string | null; target: string | null; at: number }
  | { type: "call:end"; callId: string; outcome: ToolOutcome; touched: TouchedFile[]; at: number };

/* The feed lives in memory for the whole session, so it has to stay bounded. */
export const LOOSE_CAP = 200;
export const ROUND_ENTRY_CAP = 500;

const WRITE_TOOLS: ReadonlySet<ToolName> = new Set(["write_file", "edit_file", "delete_file"]);

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

/*
 * Reads only the fields it needs, defensively: a result shape that drifts must degrade
 * to a plain line, never break the panel.
 */
export function summarize(tool: ToolName, outcome: ToolOutcome, touched: TouchedFile[], target: string | null): FeedSummary {
  if (!outcome.ok) return { kind: "error", code: outcome.error.code };
  const data = (outcome.data ?? {}) as Record<string, unknown>;
  switch (tool) {
    case "compile":
      return { kind: "compile", ok: data.ok === true };
    case "run_tests":
      return { kind: "tests", passed: num(data.passed), total: num(data.passed) + num(data.failed) + num(data.timedout) };
    case "lint":
      return { kind: "lint", count: Array.isArray(data.findings) ? data.findings.length : 0 };
    case "analyze_gas":
      return { kind: "gas", tooLow: data.activationTooLow === true };
    case "create_project": {
      const files = Array.isArray(data.files) ? data.files : [];
      const path = typeof files[0] === "string" ? files[0] : target;
      return touched[0] && path ? { kind: "write", path, fileId: touched[0].fileId } : { kind: "plain" };
    }
    default:
      return WRITE_TOOLS.has(tool) && touched[0] && target ? { kind: "write", path: target, fileId: touched[0].fileId } : { kind: "plain" };
  }
}

function capped<T>(list: T[], cap: number): T[] {
  return list.length > cap ? list.slice(list.length - cap) : list;
}

/* The newest round of the project that has not ended; calls are attributed to it. */
function openRoundIndex(rounds: FeedRound[], projectId: string | null): number {
  if (projectId === null) return -1;
  return rounds.findIndex((r) => r.projectId === projectId && r.endedAt === null);
}

function mapRound(rounds: FeedRound[], index: number, fn: (r: FeedRound) => FeedRound): FeedRound[] {
  return rounds.map((r, i) => (i === index ? fn(r) : r));
}

/*
 * Pure. `rounds` is newest first. A write's call event fires before its round starts
 * (the round begins inside the call), so such an entry waits in `loose` and the round
 * adopts it on start; create_project has no project yet and is placed on call end.
 */
export function feedReducer(state: FeedState, event: FeedEvent): FeedState {
  switch (event.type) {
    case "round:start": {
      const adopted = state.loose.filter((e) => e.status === "running" && e.projectId === event.projectId);
      const round: FeedRound = {
        roundId: event.roundId,
        projectId: event.projectId,
        startedAt: event.at,
        endedAt: null,
        checkpointId: event.checkpointId,
        entries: capped(adopted.map(({ projectId: _p, ...e }) => e), ROUND_ENTRY_CAP),
      };
      return { rounds: [round, ...state.rounds], loose: adopted.length ? state.loose.filter((e) => !adopted.includes(e)) : state.loose };
    }
    case "round:end": {
      const i = state.rounds.findIndex((r) => r.roundId === event.roundId);
      if (i < 0) return state;
      return { ...state, rounds: mapRound(state.rounds, i, (r) => ({ ...r, endedAt: event.at })) };
    }
    case "call:start": {
      const entry: FeedEntry = { callId: event.callId, at: event.at, tool: event.tool, target: event.target, status: "running", summary: { kind: "plain" } };
      const i = openRoundIndex(state.rounds, event.projectId);
      if (i >= 0) {
        return { ...state, rounds: mapRound(state.rounds, i, (r) => ({ ...r, entries: capped([...r.entries, entry], ROUND_ENTRY_CAP) })) };
      }
      return { ...state, loose: capped([...state.loose, { ...entry, projectId: event.projectId }], LOOSE_CAP) };
    }
    case "call:end": {
      const finish = (e: FeedEntry): FeedEntry => ({
        ...e,
        status: event.outcome.ok ? "ok" : "error",
        summary: summarize(e.tool, event.outcome, event.touched, e.target),
      });
      const roundIndex = state.rounds.findIndex((r) => r.entries.some((e) => e.callId === event.callId));
      if (roundIndex >= 0) {
        return { ...state, rounds: mapRound(state.rounds, roundIndex, (r) => ({ ...r, entries: r.entries.map((e) => (e.callId === event.callId ? finish(e) : e)) })) };
      }
      const looseEntry = state.loose.find((e) => e.callId === event.callId);
      if (!looseEntry) return state;
      const finished = finish(looseEntry);
      const created = event.touched[0]?.projectId ?? null;
      const target = created === null ? -1 : state.rounds.findIndex((r) => r.projectId === created);
      if (target >= 0 && looseEntry.projectId == null) {
        const { projectId: _p, ...entry } = finished;
        return {
          rounds: mapRound(state.rounds, target, (r) => ({ ...r, entries: capped([...r.entries, entry], ROUND_ENTRY_CAP) })),
          loose: state.loose.filter((e) => e !== looseEntry),
        };
      }
      return { ...state, loose: state.loose.map((e) => (e === looseEntry ? finished : e)) };
    }
  }
}

/* The feed and restore must stay reachable after the session ends, until there is nothing to show. */
export function hasActivity(state: FeedState): boolean {
  return state.rounds.length > 0 || state.loose.length > 0;
}

/*
 * Restoring a round puts the whole project back to that round's start, so every newer
 * round of the same project is undone with it; the confirm dialog must say so.
 * `rounds` is newest first, so newer rounds sit before this one.
 */
export function hasLaterRound(state: FeedState, roundId: string): boolean {
  const i = state.rounds.findIndex((r) => r.roundId === roundId);
  if (i < 0) return false;
  const projectId = state.rounds[i]!.projectId;
  return state.rounds.slice(0, i).some((r) => r.projectId === projectId);
}
