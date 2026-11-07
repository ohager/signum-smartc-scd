import type { RunRequest, TestEvent } from "./runner/types";

/** How the client talks to whatever is executing the run. */
export interface RunnerTransport {
  post(request: RunRequest): void;
  onEvent(listener: (event: TestEvent) => void): void;
  terminate(): void;
}

export interface RunOptions {
  /** Give up when no event has arrived for this long. Default 5000ms. */
  noProgressTimeoutMs?: number;
  /**
   * Cancels the run from outside — the assistant's overall deadline. Ends it the
   * way the watchdog does (in-flight test timed out, `run:end`, terminate), so
   * consumers need no second code path for "the run was cut short".
   */
  signal?: AbortSignal;
}

/**
 * Drives a run and enforces the timeout.
 *
 * The watchdog lives here rather than in the worker because a synchronous loop
 * in a contract blocks the worker's own timers — only an outside observer can
 * notice the silence and terminate.
 */
export function runTests(
  request: RunRequest,
  transport: RunnerTransport,
  emit: (event: TestEvent) => void,
  options: RunOptions = {},
): Promise<void> {
  const budget = options.noProgressTimeoutMs ?? 5000;

  return new Promise((resolve) => {
    let inFlightTestId: string | null = null;
    let timer: ReturnType<typeof setTimeout>;
    let finished = false;
    let inFlightSince = 0;
    const startedAt = Date.now();

    const { signal } = options;

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      transport.terminate();
      resolve();
    };

    const onAbort = () => {
      if (finished) return;
      const elapsed = Date.now() - inFlightSince;
      if (inFlightTestId) {
        emit({ type: "test:end", id: inFlightTestId, status: "timedout", durationMs: elapsed });
      }
      emit({ type: "run:end", durationMs: Date.now() - startedAt });
      finish();
    };

    const arm = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (inFlightTestId) {
          emit({ type: "test:end", id: inFlightTestId, status: "timedout", durationMs: budget });
        }
        emit({ type: "run:end", durationMs: budget });
        finish();
      }, budget);
    };

    transport.onEvent((event) => {
      arm();
      if (event.type === "test:start") {
        inFlightTestId = event.id;
        inFlightSince = Date.now();
      }
      if (event.type === "test:end") inFlightTestId = null;
      emit(event);
      if (event.type === "run:end") finish();
    });

    // `finish` terminates the transport, so an already-aborted run must end
    // before anything is posted to it.
    if (signal?.aborted) {
      onAbort();
      return;
    }
    signal?.addEventListener("abort", onAbort, { once: true });
    arm();
    transport.post(request);
  });
}

/**
 * The real transport: a dedicated worker per run, so a wedged run can be
 * terminated without taking anything else down. Not unit-tested — it is a thin
 * wrapper whose behaviour is the Worker API's.
 *
 * The worker is loaded from a literal, stable URL rather than the usual
 * `new URL("./runner/worker.ts", import.meta.url)` idiom. Bun's bundler does
 * not recognise that pattern the way esbuild/Vite do — the call site ships
 * verbatim into the bundle with no worker chunk emitted, so in production the
 * browser would 404 trying to fetch raw TypeScript. Instead the worker is
 * built as its own entrypoint (see build.ts) and served at a fixed path (see
 * serve.ts), so `/testbed-worker.js` resolves in both dev and production. Do
 * not "fix" this back to the `import.meta.url` form.
 */
export function createWorkerTransport(): RunnerTransport {
  const worker = new Worker("/testbed-worker.js", { type: "module" });
  return {
    post: (request) => worker.postMessage(request),
    onEvent: (listener) => {
      worker.onmessage = (event: MessageEvent<TestEvent>) => listener(event.data);
    },
    terminate: () => worker.terminate(),
  };
}
