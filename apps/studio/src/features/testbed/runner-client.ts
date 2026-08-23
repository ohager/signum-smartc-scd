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

    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      transport.terminate();
      resolve();
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
      if (event.type === "test:start") inFlightTestId = event.id;
      if (event.type === "test:end") inFlightTestId = null;
      emit(event);
      if (event.type === "run:end") finish();
    });

    arm();
    transport.post(request);
  });
}

/**
 * The real transport: a dedicated worker per run, so a wedged run can be
 * terminated without taking anything else down. Not unit-tested — it is a thin
 * wrapper whose behaviour is the Worker API's.
 */
export function createWorkerTransport(): RunnerTransport {
  const worker = new Worker(new URL("./runner/worker.ts", import.meta.url), { type: "module" });
  return {
    post: (request) => worker.postMessage(request),
    onEvent: (listener) => {
      worker.onmessage = (event: MessageEvent<TestEvent>) => listener(event.data);
    },
    terminate: () => worker.terminate(),
  };
}
