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
    const p = client.lint("a", []);
    workers[0]!.answer(0, { compiled: false, findings: [] });
    expect(await p).toEqual({ compiled: false, findings: [] });
  });

  it("runs one job at a time and keeps only the newest queued request", async () => {
    const { client, workers } = setup();
    const first = client.lint("1", []);
    const second = client.lint("2", []);
    const third = client.lint("3", []);
    const w = workers[0]!;
    expect(w.posted.map((m) => m.source)).toEqual(["1"]);
    expect(await second).toBeNull();
    w.answer(0);
    expect(await first).toBeNull(); // superseded while running
    expect(w.posted.map((m) => m.source)).toEqual(["1", "3"]);
    w.answer(1);
    expect((await third)?.compiled).toBe(true);
    expect(w.terminated).toBe(false);
    expect(workers).toHaveLength(1);
  });

  it("resolves null on a worker error, logs once and recovers", async () => {
    const { client, workers } = setup();
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...a: unknown[]) => errors.push(a);
    try {
      const p = client.lint("1", []);
      const queued = client.lint("2", []);
      workers[0]!.onerror!(new Error("boom"));
      expect(await p).toBeNull();
      expect(await queued).toBeNull();
      const again = client.lint("3", []);
      workers[1]!.onerror!(new Error("boom2"));
      expect(await again).toBeNull();
      expect(errors).toHaveLength(1);
      const ok = client.lint("4", []);
      workers[2]!.answer(0);
      expect((await ok)?.compiled).toBe(true);
    } finally {
      console.error = original;
    }
  });
});
