import { describe, it, expect } from "bun:test";
import { wireFollow, type FollowDeps } from "./follow-wiring";
import type { CheckpointFile } from "../rounds/checkpoints";

const CP: CheckpointFile[] = [{ relPath: "src/a.smart.c", type: "smartc", content: "l1\nl2\nl3" }];

function setup(opts: { route?: { projectId: string | null; fileId: string | null }; follow?: boolean; exists?: boolean } = {}) {
  const log = { nav: [] as string[], reveals: [] as unknown[], touched: [] as string[], baselines: [] as unknown[], timers: [] as (() => void)[] };
  const deps: FollowDeps = {
    fs: {
      getFileMetadata: (id: string) => (opts.exists === false ? null : ({ id, folderId: "src", path: "/p/src/a.smart.c" } as never)),
      getFolder: () => ({ path: "/p" }) as never,
      loadFile: (async () => ({ content: "l1\nL2\nl3\nl4" })) as never,
    },
    checkpointStore: { get: async () => ({ files: CP }) as never },
    registry: { revealWhenReady: (...a: unknown[]) => void log.reveals.push(a) },
    navigate: (p) => void log.nav.push(p),
    route: () => opts.route ?? { projectId: "p1", fileId: null },
    followMode: () => opts.follow ?? true,
    setBaseline: (b) => void log.baselines.push(b),
    markTouched: (id) => void log.touched.push(id),
    setTimeout: (fn) => void log.timers.push(fn),
  };
  const w = wireFollow(deps);
  w.onRoundStarted!({ projectId: "p1", roundId: "r1", checkpointId: "c1", at: 0 });
  const call = (touched = [{ fileId: "f1", projectId: "p1" }], ok = true) =>
    w.onCallEnded!({ callId: "1", outcome: ok ? { ok: true, data: null } : ({ ok: false, error: {} } as never), touched, at: 0 });
  const settle = () => new Promise((r) => setTimeout(r, 5));
  return { w, log, call, settle };
}

describe("wireFollow", () => {
  it("opens the file, revealing the first change and highlighting the changed ranges", async () => {
    const { log, call, settle } = setup();
    call();
    await settle();
    expect(log.reveals).toEqual([["f1", 2, [{ from: 2, to: 2 }, { from: 4, to: 4 }]]]);
    expect(log.nav).toEqual(["/projects/src/files/f1"]);
    expect(log.touched).toEqual([]);
  });

  it("only dots when the user is in another project, without navigating", async () => {
    const { log, call, settle } = setup({ route: { projectId: "p2", fileId: "x" } });
    call();
    await settle();
    expect(log.nav).toEqual([]);
    expect(log.touched).toEqual(["f1"]);
  });

  it("dots when follow mode is off", async () => {
    const { log, call, settle } = setup({ follow: false });
    call();
    await settle();
    expect(log.nav).toEqual([]);
    expect(log.touched).toEqual(["f1"]);
  });

  it("does not navigate to a file that is already open, and reveals after the editor adopts it", async () => {
    const { log, call, settle } = setup({ route: { projectId: "p1", fileId: "f1" } });
    call();
    await settle();
    expect(log.nav).toEqual([]);
    expect(log.reveals).toEqual([]);
    log.timers[0]!();
    expect(log.reveals.length).toBe(1);
  });

  it("gives deleted files neither navigation nor dot, and ignores failed calls", async () => {
    const gone = setup({ exists: false });
    gone.call();
    await gone.settle();
    expect(gone.log.nav).toEqual([]);
    expect(gone.log.touched).toEqual([]);
    const failed = setup();
    failed.call(undefined, false);
    await failed.settle();
    expect(failed.log.nav).toEqual([]);
  });

  it("opens one file per call; further files get dots", async () => {
    const { log, call, settle } = setup();
    call([{ fileId: "f1", projectId: "p1" }, { fileId: "f2", projectId: "p1" }]);
    await settle();
    expect(log.nav.length).toBe(1);
    expect(log.touched).toEqual(["f2"]);
  });

  it("switches the baseline only when the round ends", async () => {
    const { w, log, settle } = setup();
    await settle();
    expect(log.baselines.length).toBe(1);
    w.onRoundEnded!({ projectId: "p1", roundId: "r1", reason: "idle", at: 1 });
    await settle();
    expect(log.baselines.length).toBe(2);
    w.onRoundStarted!({ projectId: "p1", roundId: "r2", checkpointId: "c2", at: 2 });
    await settle();
    expect(log.baselines.at(-1)).toEqual({ p1: CP });
  });
});
