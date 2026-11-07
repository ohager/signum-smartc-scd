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
  source: string;
  params: SlotLabel[];
  resolve: (result: LintResult | null) => void;
}

/**
 * Latest request wins, one job at a time. A job already running is never
 * killed (the lint cannot be interrupted, and restarting a worker costs more
 * than waiting); it finishes and resolves `null` if something newer arrived,
 * and only the newest waiting request is kept.
 */
export function createAnalysisClient(openWorker: () => WorkerLike) {
  let worker: WorkerLike | null = null;
  let nextId = 0;
  let running: { id: number; job: Job; superseded: boolean } | null = null;
  let queued: Job | null = null;
  let logged = false;

  const fail = (e: unknown) => {
    if (!logged) {
      logged = true;
      console.error("smartc analysis worker failed", e);
    }
    worker?.terminate();
    worker = null; // reopened on the next request
    running?.job.resolve(null);
    queued?.resolve(null);
    running = null;
    queued = null;
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
          done.job.resolve(done.superseded || msg.error !== undefined ? null : (msg.result ?? null));
          const next = queued;
          queued = null;
          if (next) start(next);
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
    lint(source: string, params: SlotLabel[]): Promise<LintResult | null> {
      return new Promise((resolve) => {
        const job = { source, params, resolve };
        if (!running) return start(job);
        running.superseded = true;
        queued?.resolve(null);
        queued = job;
      });
    },
    dispose(): void {
      worker?.terminate();
      worker = null;
      running?.job.resolve(null);
      queued?.resolve(null);
      running = null;
      queued = null;
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
