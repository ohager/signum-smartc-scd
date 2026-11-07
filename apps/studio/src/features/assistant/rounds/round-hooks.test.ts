import { describe, it, expect } from "bun:test";
import { createRoundHooks } from "./round-hooks";
import type { Checkpoint } from "./checkpoints";

function setup(over: Partial<Parameters<typeof createRoundHooks>[0]> = {}) {
  const log: string[] = [];
  const cp: Checkpoint = { id: "cp-1", projectId: "p", createdAt: 1, reason: "round-start", files: [] };
  const hooks = createRoundHooks({
    flush: async () => void log.push("flush"),
    capture: async () => (log.push("capture"), cp),
    lock: () => void log.push("lock"),
    unlock: () => void log.push("unlock"),
    endSnapshot: async () => void log.push("endSnapshot"),
    notify: {
      roundStarted: (e) => void log.push(`started:${e.checkpointId}`),
      roundEnded: (e) => void log.push(`ended:${e.reason}`),
    },
    ...over,
  });
  return { hooks, log };
}

describe("createRoundHooks", () => {
  it("starts flush -> capture -> lock, then notifies", async () => {
    const { hooks, log } = setup();
    const r = await hooks.start("p");
    expect(log).toEqual(["flush", "capture", "lock", "started:cp-1"]);
    expect(r.checkpointId).toBe("cp-1");
    expect(r.roundId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("ends endSnapshot -> unlock, then notifies", async () => {
    const { hooks, log } = setup();
    await hooks.end("p", "r1", "idle");
    expect(log).toEqual(["endSnapshot", "unlock", "ended:idle"]);
  });

  it("does not lock when capture throws", async () => {
    const log: string[] = [];
    const { hooks } = setup({
      flush: async () => void log.push("flush"),
      capture: async () => {
        log.push("capture");
        throw new Error("boom");
      },
      lock: () => void log.push("lock"),
      unlock: () => void log.push("unlock"),
    });
    await expect(hooks.start("p")).rejects.toThrow("boom");
    expect(log).toEqual(["flush", "capture"]);
  });

  it("unlocks when lock throws, then propagates without notifying", async () => {
    const calls: string[] = [];
    const { hooks, log } = setup({
      lock: () => {
        throw new Error("lock failed");
      },
      unlock: (id) => void calls.push(`unlock:${id}`),
    });
    await expect(hooks.start("p")).rejects.toThrow("lock failed");
    expect(calls).toEqual(["unlock:p"]);
    expect(log).toEqual(["flush", "capture"]);
  });

  it("still propagates the lock error if unlock also throws", async () => {
    const { hooks } = setup({
      lock: () => {
        throw new Error("lock failed");
      },
      unlock: () => {
        throw new Error("unlock failed");
      },
    });
    await expect(hooks.start("p")).rejects.toThrow("lock failed");
  });
});
