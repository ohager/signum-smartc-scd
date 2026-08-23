import { runRequest } from "./run-request";
import type { RunRequest, TestEvent } from "./types";

// Structured clone handles BigInt, so events need no encoding.
self.onmessage = async (event: MessageEvent<RunRequest>) => {
  await runRequest(event.data, (e: TestEvent) => self.postMessage(e));
};
