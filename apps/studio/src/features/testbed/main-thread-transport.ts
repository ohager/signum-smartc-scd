import { runRequest } from "./runner/run-request";
import type { RunnerTransport } from "./runner-client";
import type { RunRequest, TestEvent } from "./runner/types";

/**
 * Runs tests in the page instead of a worker, so the browser's own debugger can
 * reach them: `debugger;` statements break, and the `//# sourceURL` the module
 * registry appends makes each file appear in DevTools Sources under its real path.
 *
 * The trade-off is real and the reason this is not the default — a contract that
 * loops forever freezes the tab, and the watchdog cannot rescue it, because the
 * timer it depends on is blocked by the very loop it would interrupt.
 */
export function createMainThreadTransport(): RunnerTransport {
  let listener: (event: TestEvent) => void = () => {};

  return {
    post: (request: RunRequest) => {
      void runRequest(request, (event) => listener(event));
    },
    onEvent: (l) => {
      listener = l;
    },
    terminate: () => {
      // Nothing to tear down: the run owns the main thread until it finishes.
    },
  };
}
