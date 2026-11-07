import type { SlotLabel } from "@/features/inspector/model/label-map";
import type { LintFinding } from "../lint/types";

export type LintResult = { compiled: boolean; findings: LintFinding[] };

/** The slice of `Worker` the client uses, so tests can fake it. */
export interface WorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

interface Job {
  key: string;
  source: string;
  params: SlotLabel[];
  resolve: (result: LintResult | null) => void;
}

/**
 * One job at a time, latest request wins per key (a model's URI). Pending
 * requests wait in insertion order, so every model gets its turn; a newer
 * request for a key replaces only that key's pending one. A job already
 * running is never killed (the lint cannot be interrupted, and restarting a
 * worker costs more than waiting): if its key is requested again it resolves
 * `null` when it answers, and the new request waits behind it.
 */
export function createAnalysisClient(openWorker: () => WorkerLike) {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  let running: { id: number; job: Job; superseded: boolean } | null = null;
  const pending = new Map<string, Job>();
  const logged = new Set<string>();

  const logOnce = (what: string, detail: unknown) => {
    const text = detail instanceof Error ? detail.message : String(detail);
    if (logged.has(text)) return;
    logged.add(text);
    console.error(what, detail);
  };

  const dropAll = () => {
    running?.job.resolve(null);
    pending.forEach((j) => j.resolve(null));
    running = null;
    pending.clear();
  };

  const fail = (e: unknown) => {
    logOnce("smartc analysis worker failed", e);
    worker?.terminate();
    worker = null; // reopened on the next request
    dropAll();
  };

  const startNext = () => {
    const first = pending.entries().next();
    if (first.done) return;
    const [key, job] = first.value;
    pending.delete(key);
    start(job);
  };

  const start = (job: Job) => {
    try {
      if (!worker) {
        worker = openWorker();
        worker.onmessage = ({ data }) => {
          const msg = data as { id: number; result?: LintResult; error?: string };
          if (!running || msg.id !== running.id) return;
          const done = running;
          running = null;
          if (msg.error !== undefined) logOnce("smartc analysis failed", msg.error);
          done.job.resolve(done.superseded || msg.error !== undefined ? null : (msg.result ?? null));
          startNext();
        };
        worker.onerror = fail;
      }
      running = { id: nextId++, job, superseded: false };
      worker.postMessage({ id: running.id, source: job.source, params: job.params });
    } catch (e) {
      running = null;
      job.resolve(null);
      fail(e);
    }
  };

  return {
    lint(key: string, source: string, params: SlotLabel[]): Promise<LintResult | null> {
      return new Promise((resolve) => {
        const job = { key, source, params, resolve };
        if (!running) return start(job);
        if (running.job.key === key) running.superseded = true;
        // Delete first so the replacement queues behind older keys.
        pending.get(key)?.resolve(null);
        pending.delete(key);
        pending.set(key, job);
      });
    },
    dispose(): void {
      worker?.terminate();
      worker = null;
      dropAll();
    },
  };
}

let shared: ReturnType<typeof createAnalysisClient> | null = null;

/**
 * The app-wide client. The worker URL is a literal for the same reason as the
 * test-runner's: Bun does not bundle `new URL(..., import.meta.url)` workers,
 * so build.ts emits it and serve.ts serves it at this fixed path.
 */
export function analysisClient() {
  shared ??= createAnalysisClient(() => new Worker("/analysis-worker.js", { type: "module" }) as unknown as WorkerLike);
  return shared;
}
