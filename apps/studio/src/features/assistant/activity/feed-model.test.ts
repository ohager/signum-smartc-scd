import { describe, it, expect } from "bun:test";
import type { ToolOutcome } from "@smartc-studio/assistant-protocol";
import { agentActiveUntil, feedReducer, hasActivity, hasLaterRound, summarize, ACTIVE_WINDOW_MS, LOOSE_CAP, ROUND_ENTRY_CAP, type FeedEvent, type FeedState } from "./feed-model";

const empty: FeedState = { rounds: [], loose: [] };
const run = (events: FeedEvent[], from: FeedState = empty) => events.reduce(feedReducer, from);

const roundStart = (roundId = "r1", projectId = "p1", at = 1): FeedEvent => ({ type: "round:start", roundId, projectId, checkpointId: `cp-${roundId}`, at });
const callStart = (callId: string, projectId: string | null, tool: "write_file" | "compile" | "list_projects" = "write_file", target: string | null = "/p/a.smart.c", at = 2): FeedEvent => ({ type: "call:start", callId, tool, projectId, target, at });
const ok = (data: unknown = {}): ToolOutcome => ({ ok: true, data });

describe("feedReducer", () => {
  it("groups calls by round", () => {
    const s = run([roundStart("r1", "p1"), roundStart("r2", "p2"), callStart("1", "p1"), callStart("2", "p2"), callStart("3", "p1", "compile")]);
    expect(s.rounds.find((r) => r.roundId === "r1")!.entries.map((e) => e.callId)).toEqual(["1", "3"]);
    expect(s.rounds.find((r) => r.roundId === "r2")!.entries.map((e) => e.callId)).toEqual(["2"]);
    expect(s.loose).toEqual([]);
  });

  it("puts global calls and calls without an open round into loose", () => {
    const s = run([callStart("1", null, "list_projects", null), callStart("2", "p9", "compile")]);
    expect(s.loose.map((e) => e.callId)).toEqual(["1", "2"]);
  });

  it("moves a write that started before its round into that round", () => {
    const s = run([callStart("1", "p1"), roundStart("r1", "p1")]);
    expect(s.loose).toEqual([]);
    expect(s.rounds[0]!.entries.map((e) => e.callId)).toEqual(["1"]);
  });

  it("call:end updates status and summary", () => {
    const s = run([roundStart(), callStart("1", "p1", "compile"), { type: "call:end", callId: "1", outcome: ok({ ok: true }), touched: [], at: 3 }]);
    const e = s.rounds[0]!.entries[0]!;
    expect(e.status).toBe("ok");
    expect(e.summary).toEqual({ kind: "compile", ok: true });
  });

  it("marks failed calls as error with the code", () => {
    const outcome: ToolOutcome = { ok: false, error: { code: "file_not_found", message: "x", hint: "y" } };
    const s = run([callStart("1", null, "list_projects", null), { type: "call:end", callId: "1", outcome, touched: [], at: 3 }]);
    expect(s.loose[0]!.status).toBe("error");
    expect(s.loose[0]!.summary).toEqual({ kind: "error", code: "file_not_found" });
  });

  it("ignores call:end for an unknown call", () => {
    const s = run([roundStart()]);
    expect(feedReducer(s, { type: "call:end", callId: "nope", outcome: ok(), touched: [], at: 3 })).toBe(s);
  });

  it("moves a create_project call into the round of the project it created", () => {
    const s = run([
      callStart("1", null, "write_file", "newproj"),
      roundStart("r1", "p-new"),
      { type: "call:end", callId: "1", outcome: ok({ files: ["/newproj/a.smart.c"] }), touched: [{ fileId: "f1", projectId: "p-new" }], at: 3 },
    ]);
    expect(s.loose).toEqual([]);
    expect(s.rounds[0]!.entries[0]!.callId).toBe("1");
  });

  it("round:end records the end time", () => {
    const s = run([roundStart(), { type: "round:end", roundId: "r1", at: 9 }]);
    expect(s.rounds[0]!.endedAt).toBe(9);
  });

  it("caps loose and per-round entries, dropping the oldest", () => {
    const loose = run(Array.from({ length: LOOSE_CAP + 5 }, (_, i) => callStart(`l${i}`, null, "list_projects", null)));
    expect(loose.loose).toHaveLength(LOOSE_CAP);
    expect(loose.loose[0]!.callId).toBe("l5");
    const inRound = run([roundStart(), ...Array.from({ length: ROUND_ENTRY_CAP + 3 }, (_, i) => callStart(`c${i}`, "p1", "compile"))]);
    expect(inRound.rounds[0]!.entries).toHaveLength(ROUND_ENTRY_CAP);
    expect(inRound.rounds[0]!.entries[0]!.callId).toBe("c3");
  });
});

describe("hasLaterRound", () => {
  it("is true only when the same project has a newer round", () => {
    const s = run([roundStart("r1", "p1", 1), roundStart("r2", "p2", 2), roundStart("r3", "p1", 3)]);
    expect(hasLaterRound(s, "r1")).toBe(true);
    expect(hasLaterRound(s, "r3")).toBe(false);
    expect(hasLaterRound(s, "r2")).toBe(false);
    expect(hasLaterRound(s, "unknown")).toBe(false);
  });
});

describe("hasActivity", () => {
  it("is false only for an empty feed", () => {
    expect(hasActivity(empty)).toBe(false);
    expect(hasActivity(run([callStart("1", null, "list_projects", null)]))).toBe(true);
    expect(hasActivity(run([roundStart()]))).toBe(true);
  });
});

describe("summarize", () => {
  const touched = [{ fileId: "f1", projectId: "p1" }];
  it("compile", () => {
    expect(summarize("compile", ok({ ok: true }), [], null)).toEqual({ kind: "compile", ok: true });
    expect(summarize("compile", ok({ ok: false }), [], null)).toEqual({ kind: "compile", ok: false });
  });
  it("run_tests counts passed, failed and timed out", () => {
    expect(summarize("run_tests", ok({ passed: 9, failed: 3 }), [], null)).toEqual({ kind: "tests", passed: 9, total: 12 });
    expect(summarize("run_tests", ok({ passed: 1, failed: 1, timedout: 2 }), [], null)).toEqual({ kind: "tests", passed: 1, total: 4 });
  });
  it("lint counts findings", () => {
    expect(summarize("lint", ok({ findings: [1, 2] }), [], null)).toEqual({ kind: "lint", count: 2 });
  });
  it("analyze_gas", () => {
    expect(summarize("analyze_gas", ok({ activationTooLow: true }), [], null)).toEqual({ kind: "gas", tooLow: true });
  });
  it("write tools take the path from the target and the id from touched", () => {
    for (const tool of ["write_file", "edit_file", "delete_file"] as const) {
      expect(summarize(tool, ok({}), touched, "/p/a.smart.c")).toEqual({ kind: "write", path: "/p/a.smart.c", fileId: "f1" });
    }
  });
  it("create_project is a write of the contract file", () => {
    expect(summarize("create_project", ok({ files: ["/p/c.smart.c"] }), touched, "p")).toEqual({ kind: "write", path: "/p/c.smart.c", fileId: "f1" });
  });
  it("a write that touched nothing is plain", () => {
    expect(summarize("write_file", ok({}), [], "/p/a")).toEqual({ kind: "plain" });
  });
  it("any failure is an error with its code", () => {
    expect(summarize("compile", { ok: false, error: { code: "internal", message: "m", hint: "h" } }, [], null)).toEqual({ kind: "error", code: "internal" });
  });
  it("everything else is plain", () => {
    expect(summarize("list_projects", ok([]), [], null)).toEqual({ kind: "plain" });
  });
});

describe("summarize edge", () => {
  it("run_tests with nothing run totals 0", () => {
    expect(summarize("run_tests", { ok: true, data: { passed: 0, failed: 0 } }, [], null)).toEqual({ kind: "tests", passed: 0, total: 0 });
  });
});

describe("agentActiveUntil", () => {
  const callEnd = (callId: string, at: number): FeedEvent => ({ type: "call:end", callId, outcome: ok(), touched: [], at });
  const roundEnd = (roundId: string, at: number): FeedEvent => ({ type: "round:end", roundId, at });

  it("is null before the agent ever called", () => {
    expect(agentActiveUntil(empty)).toBeNull();
  });

  it("lasts while a round is open, even between calls", () => {
    const s = run([roundStart("r1", "p1", 1), callStart("1", "p1", "write_file", "/p/a", 2), callEnd("1", 3)]);
    expect(agentActiveUntil(s)).toBe(Infinity);
  });

  it("lasts while a call outside any round runs", () => {
    const s = run([callStart("1", null, "list_projects", null, 5)]);
    expect(agentActiveUntil(s)).toBe(Infinity);
  });

  it("ends one window after the last call once nothing runs", () => {
    const s = run([callStart("1", null, "list_projects", null, 5), callEnd("1", 6), callStart("2", "p9", "compile", "/p9/c", 40), callEnd("2", 41)]);
    expect(agentActiveUntil(s)).toBe(40 + ACTIVE_WINDOW_MS);
  });

  it("counts calls in ended rounds", () => {
    const s = run([roundStart("r1", "p1", 1), callStart("1", "p1", "write_file", "/p/a", 70), callEnd("1", 71), roundEnd("r1", 100)]);
    expect(agentActiveUntil(s)).toBe(70 + ACTIVE_WINDOW_MS);
  });

  it("takes the latest call across rounds and loose calls", () => {
    const s = run([
      roundStart("r1", "p1", 1),
      callStart("1", "p1", "write_file", "/p/a", 10),
      callEnd("1", 11),
      roundEnd("r1", 20),
      callStart("2", null, "list_projects", null, 30),
      callEnd("2", 31),
      roundStart("r2", "p2", 40),
      callStart("3", "p2", "write_file", "/p2/a", 50),
      callEnd("3", 51),
      roundEnd("r2", 60),
    ]);
    expect(agentActiveUntil(s, 5)).toBe(55);
  });
});
