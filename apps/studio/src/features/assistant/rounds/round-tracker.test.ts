import { describe, it, expect, beforeEach } from "bun:test";
import { RoundTracker, type Clock, type RoundHooks } from "./round-tracker";
import { AssistantFailure } from "../tools/errors";

class FakeClock implements Clock {
  private t = 0;
  private nextId = 1;
  private timers = new Map<number, { at: number; fn: () => void }>();
  now() {
    return this.t;
  }
  setTimeout(fn: () => void, ms: number) {
    const id = this.nextId++;
    this.timers.set(id, { at: this.t + ms, fn });
    return id;
  }
  clearTimeout(handle: unknown) {
    this.timers.delete(handle as number);
  }
  /** Moves time forward, firing each due timer in order at its own due time. */
  advance(ms: number) {
    const target = this.t + ms;
    for (;;) {
      const due = [...this.timers.entries()].filter(([, v]) => v.at <= target).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.timers.delete(due[0]);
      this.t = due[1].at;
      due[1].fn();
    }
    this.t = target;
  }
}

let clock: FakeClock;
let tracker: RoundTracker;
let starts: string[];
let ends: { projectId: string; roundId: string; reason: string }[];
let startGate: Promise<void> | null;

beforeEach(() => {
  clock = new FakeClock();
  starts = [];
  ends = [];
  startGate = null;
  const hooks: RoundHooks = {
    async start(projectId) {
      starts.push(projectId);
      if (startGate) await startGate;
      return { roundId: `r${starts.length}`, checkpointId: `c${starts.length}` };
    },
    async end(projectId, roundId, reason) {
      ends.push({ projectId, roundId, reason });
    },
  };
  tracker = new RoundTracker({ idleMs: 60_000, clock, hooks });
});

async function rejection(p: Promise<unknown>): Promise<AssistantFailure> {
  try {
    await p;
  } catch (e) {
    expect(e).toBeInstanceOf(AssistantFailure);
    return e as AssistantFailure;
  }
  throw new Error("did not throw");
}

describe("RoundTracker", () => {
  it("starts a round on the first write only", async () => {
    await tracker.begin("a", "write");
    tracker.finish("a");
    await tracker.begin("a", "write");
    expect(starts).toEqual(["a"]);
    expect(tracker.active("a")).toEqual({ roundId: "r1", startedAt: 0 });
  });

  it("reads extend but never start", async () => {
    await tracker.begin("a", "read");
    tracker.finish("a");
    expect(starts).toEqual([]);
    expect(tracker.active("a")).toBeNull();
    clock.advance(100_000);
    expect(ends).toEqual([]);

    await tracker.begin("a", "write");
    tracker.finish("a");
    clock.advance(50_000);
    await tracker.begin("a", "read");
    tracker.finish("a");
    clock.advance(59_999);
    expect(ends).toEqual([]);
    clock.advance(1);
    expect(ends).toHaveLength(1);
  });

  it("ends after 60 s idle", async () => {
    await tracker.begin("a", "write");
    tracker.finish("a");
    clock.advance(59_999);
    expect(ends).toEqual([]);
    clock.advance(1);
    expect(ends).toEqual([{ projectId: "a", roundId: "r1", reason: "idle" }]);
    expect(tracker.active("a")).toBeNull();
  });

  it("idle timer waits for in-flight calls", async () => {
    await tracker.begin("a", "write");
    clock.advance(120_000);
    expect(ends).toEqual([]);
    tracker.finish("a");
    clock.advance(59_999);
    expect(ends).toEqual([]);
    clock.advance(1);
    expect(ends).toHaveLength(1);
  });

  it("a new call clears an armed idle timer", async () => {
    await tracker.begin("a", "write");
    tracker.finish("a");
    clock.advance(30_000);
    await tracker.begin("a", "read");
    clock.advance(120_000);
    expect(ends).toEqual([]);
    tracker.finish("a");
    clock.advance(60_000);
    expect(ends).toHaveLength(1);
  });

  it("takeOver ends at once and rejects the next write once", async () => {
    await tracker.begin("a", "write");
    tracker.finish("a");
    await tracker.takeOver("a");
    expect(ends).toEqual([{ projectId: "a", roundId: "r1", reason: "takeover" }]);
    clock.advance(120_000);
    expect(ends).toHaveLength(1);

    const failure = await rejection(tracker.begin("a", "write"));
    expect(failure.code).toBe("user_took_over");
    expect(failure.message).toBe("The user took over. Re-read the files and ask before writing again.");

    await tracker.begin("a", "write");
    expect(starts).toEqual(["a", "a"]);
    expect(tracker.active("a")?.roundId).toBe("r2");
  });

  it("takeOver between rounds still rejects the next write; reads keep the flag", async () => {
    await tracker.takeOver("a");
    expect(ends).toEqual([]);
    await tracker.begin("a", "read");
    tracker.finish("a");
    expect((await rejection(tracker.begin("a", "write"))).code).toBe("user_took_over");
    await tracker.begin("a", "write");
    expect(starts).toEqual(["a"]);
  });

  it("a finish after the round ended is a no-op", async () => {
    await tracker.begin("a", "write");
    await tracker.takeOver("a");
    tracker.finish("a");
    tracker.finish("never-seen");
    clock.advance(120_000);
    expect(ends).toHaveLength(1);
  });

  it("rounds are per project", async () => {
    await tracker.begin("a", "write");
    tracker.finish("a");
    await tracker.begin("b", "write");
    tracker.finish("b");
    await tracker.takeOver("a");
    await tracker.begin("b", "write");
    tracker.finish("b");
    expect(starts).toEqual(["a", "b"]);
    expect(ends.map((e) => e.projectId)).toEqual(["a"]);
    clock.advance(60_000);
    expect(ends.map((e) => e.projectId)).toEqual(["a", "b"]);
  });

  it("concurrent writes share one start", async () => {
    let open!: () => void;
    startGate = new Promise<void>((r) => (open = r));
    const first = tracker.begin("a", "write");
    const second = tracker.begin("a", "write");
    open();
    await Promise.all([first, second]);
    expect(starts).toEqual(["a"]);
    tracker.finish("a");
    clock.advance(120_000);
    expect(ends).toEqual([]); // second call still in flight
    tracker.finish("a");
    clock.advance(60_000);
    expect(ends).toHaveLength(1);
  });

  it("a failed start leaves no round and can be retried", async () => {
    let fail = true;
    const t = new RoundTracker({
      idleMs: 1000,
      clock,
      hooks: {
        async start() {
          if (fail) throw new Error("boom");
          return { roundId: "ok", checkpointId: "c" };
        },
        async end() {},
      },
    });
    await expect(t.begin("a", "write")).rejects.toThrow("boom");
    expect(t.active("a")).toBeNull();
    fail = false;
    await t.begin("a", "write");
    expect(t.active("a")?.roundId).toBe("ok");
  });

  it("endAll ends every round with disconnect", async () => {
    await tracker.begin("a", "write");
    tracker.finish("a");
    await tracker.begin("b", "write");
    await tracker.endAll("disconnect");
    expect(ends.map((e) => [e.projectId, e.reason]).sort()).toEqual([
      ["a", "disconnect"],
      ["b", "disconnect"],
    ]);
    expect(tracker.active("a")).toBeNull();
    clock.advance(120_000);
    expect(ends).toHaveLength(2);
  });
});
