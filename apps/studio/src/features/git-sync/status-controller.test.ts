import { describe, expect, it } from "bun:test";
import { createStatusController, type RemoteCache } from "./status-controller";
import type { RepoStatus } from "./use-repo-status";

function setup(shouldCheck = true) {
  const cache: RemoteCache = new Map();
  const checked = new Map<string, string>();
  const out: RepoStatus[] = [];
  const calls: boolean[] = [];
  const pending: Array<(v: { localChanges: number; remoteAhead: boolean | null }) => void> = [];
  const make = (baseCommit = "c1") =>
    createStatusController({
      projectId: "p",
      baseCommit,
      fetch: (remote) => {
        calls.push(remote);
        return new Promise((r) => pending.push(r));
      },
      throttle: { shouldCheck: () => shouldCheck },
      cache,
      checked,
      onStatus: (s) => out.push(s),
    });
  return { cache, checked, out, calls, pending, make };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("status controller", () => {
  it("a local run during an in-flight remote run does not drop the remote result", async () => {
    const { cache, out, pending, make } = setup();
    const ctl = make();
    void ctl.start(); // remote, pending[0]
    ctl.scheduleLocal();
    await new Promise((r) => setTimeout(r, 600));
    expect(pending.length).toBe(2);
    pending[1]({ localChanges: 2, remoteAhead: null }); // local finishes first
    await tick();
    pending[0]({ localChanges: 1, remoteAhead: true }); // stale remote finishes after
    await tick();
    expect(cache.get("p")).toEqual({ commit: "c1", ahead: true });
    expect(out.at(-1)).toEqual({ state: "diverged", localChanges: 2, remoteAhead: true });
    ctl.dispose();
  });

  it("mount respects the throttle unless the base commit changed", async () => {
    const t = setup(false);
    const first = t.make("c1");
    void first.start();
    expect(t.calls).toEqual([true]); // never checked before: base commit is new
    t.pending[0]({ localChanges: 0, remoteAhead: false });
    await tick();
    void t.make("c1").start();
    expect(t.calls).toEqual([true, false]); // blocked, same commit
    void t.make("c2").start();
    expect(t.calls).toEqual([true, false, true]); // bypass: new base commit
  });

  it("when the throttle blocks, the cached remote answer shows", async () => {
    const t = setup(false);
    t.checked.set("p", "c1");
    t.cache.set("p", { commit: "c1", ahead: true });
    void t.make("c1").start();
    t.pending[0]({ localChanges: 0, remoteAhead: null });
    await tick();
    expect(t.out.at(-1)).toEqual({ state: "remote", localChanges: 0, remoteAhead: true });
  });
});
