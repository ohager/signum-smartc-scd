import { describe, expect, it } from "bun:test";
import { createAnalysisClient, type LintResult, type WorkerLike } from "./analysis-client";

class FakeWorker implements WorkerLike {
  posted: { id: number; source: string }[] = [];
  terminated = false;
  onmessage: WorkerLike["onmessage"] = null;
  onerror: WorkerLike["onerror"] = null;
  postMessage(m: unknown) {
    this.posted.push(m as { id: number; source: string });
  }
  terminate() {
    this.terminated = true;
  }
  answer(index: number, result: LintResult = { compiled: true, findings: [] }) {
    this.onmessage!({ data: { id: this.posted[index]!.id, result } });
  }
}

const setup = () => {
  const workers: FakeWorker[] = [];
  const client = createAnalysisClient(() => {
    const w = new FakeWorker();
    workers.push(w);
    return w;
  });
  return { client, workers };
};

describe("analysis client", () => {
  it("resolves the result of a lone request", async () => {
    const { client, workers } = setup();
    const p = client.lint("k", "a", []);
    workers[0]!.answer(0, { compiled: false, findings: [] });
    expect(await p).toEqual({ compiled: false, findings: [] });
  });

  it("serves different keys back to back, oldest first", async () => {
    const { client, workers } = setup();
    const a = client.lint("a", "A", []);
    const b = client.lint("b", "B", []);
    const c = client.lint("c", "C", []);
    const w = workers[0]!;
    expect(w.posted.map((m) => m.source)).toEqual(["A"]);
    w.answer(0);
    w.answer(1);
    w.answer(2);
    expect((await a)?.compiled).toBe(true);
    expect((await b)?.compiled).toBe(true);
    expect((await c)?.compiled).toBe(true);
    expect(w.posted.map((m) => m.source)).toEqual(["A", "B", "C"]);
    expect(w.terminated).toBe(false);
  });

  it("replaces only the same key's pending request", async () => {
    const { client, workers } = setup();
    const running = client.lint("a", "A", []);
    const first = client.lint("b", "B1", []);
    const other = client.lint("c", "C", []);
    const second = client.lint("b", "B2", []);
    expect(await first).toBeNull();
    const w = workers[0]!;
    w.answer(0);
    expect((await running)?.compiled).toBe(true);
    w.answer(1);
    w.answer(2);
    expect((await other)?.compiled).toBe(true);
    expect((await second)?.compiled).toBe(true);
    expect(w.posted.map((m) => m.source)).toEqual(["A", "C", "B2"]);
  });

  it("queues a re-request of the running key and drops the stale answer", async () => {
    const { client, workers } = setup();
    const old = client.lint("a", "A1", []);
    const fresh = client.lint("a", "A2", []);
    const w = workers[0]!;
    expect(w.posted.map((m) => m.source)).toEqual(["A1"]);
    w.answer(0);
    expect(await old).toBeNull();
    expect(w.posted.map((m) => m.source)).toEqual(["A1", "A2"]);
    w.answer(1);
    expect((await fresh)?.compiled).toBe(true);
  });

  it("logs a worker-reported error once per message and resolves null", async () => {
    const { client, workers } = setup();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      for (let i = 0; i < 3; i++) {
        const p = client.lint("a", "A", []);
        workers[0]!.onmessage!({ data: { id: i, error: "same" } });
        expect(await p).toBeNull();
      }
      const p = client.lint("a", "A", []);
      workers[0]!.onmessage!({ data: { id: 3, error: "other" } });
      expect(await p).toBeNull();
      expect(errors).toHaveLength(2);
    } finally {
      console.error = original;
    }
  });

  it("resolves null on a worker error, logs once and recovers", async () => {
    const { client, workers } = setup();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      const p = client.lint("k","1", []);
      const queued = client.lint("k","2", []);
      workers[0]!.onerror!(new Error("boom"));
      expect(await p).toBeNull();
      expect(await queued).toBeNull();
      const again = client.lint("k","3", []);
      workers[1]!.onerror!(new Error("boom"));
      expect(await again).toBeNull();
      expect(errors).toHaveLength(1);
      const ok = client.lint("k","4", []);
      workers[2]!.answer(0);
      expect((await ok)?.compiled).toBe(true);
    } finally {
      console.error = original;
    }
  });
});
