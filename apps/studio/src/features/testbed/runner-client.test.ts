import { describe, it, expect } from "bun:test";
import { runTests, type RunnerTransport } from "./runner-client";
import type { RunRequest, TestEvent } from "./runner/types";

const emptyRequest: RunRequest = { modules: {}, rawFiles: {}, entryPaths: [] };

/** A transport whose events are driven by the test instead of a real worker. */
function fakeTransport() {
  let listener: (event: TestEvent) => void = () => {};
  const state = { posted: 0, terminated: false };
  const transport: RunnerTransport = {
    post: () => {
      state.posted++;
    },
    onEvent: (l) => {
      listener = l;
    },
    terminate: () => {
      state.terminated = true;
    },
  };
  return { transport, state, send: (e: TestEvent) => listener(e) };
}

describe("runTests", () => {
  it("forwards events and resolves on run:end", async () => {
    const { transport, send } = fakeTransport();
    const seen: TestEvent[] = [];
    const done = runTests(emptyRequest, transport, (e) => seen.push(e));

    send({ type: "test:start", id: "a#0", name: "t", path: ["t"], file: "a" });
    send({ type: "test:end", id: "a#0", status: "passed", durationMs: 1 });
    send({ type: "run:end", durationMs: 2 });

    await done;
    expect(seen.map((e) => e.type)).toEqual(["test:start", "test:end", "run:end"]);
  });

  it("posts the request to the transport", async () => {
    const { transport, state, send } = fakeTransport();
    const done = runTests(emptyRequest, transport, () => {});
    send({ type: "run:end", durationMs: 0 });
    await done;
    expect(state.posted).toBe(1);
  });

  it("terminates the transport when the run ends", async () => {
    const { transport, state, send } = fakeTransport();
    const done = runTests(emptyRequest, transport, () => {});
    send({ type: "run:end", durationMs: 0 });
    await done;
    expect(state.terminated).toBe(true);
  });

  it("times out the in-flight test when the worker stops responding", async () => {
    const { transport, state, send } = fakeTransport();
    const seen: TestEvent[] = [];
    const done = runTests(emptyRequest, transport, (e) => seen.push(e), {
      noProgressTimeoutMs: 30,
    });

    send({ type: "test:start", id: "a#0", name: "hangs", path: ["hangs"], file: "a" });
    // Deliberately send nothing else: the worker is wedged.
    await done;

    const end = seen.find((e) => e.type === "test:end") as any;
    expect(end.id).toBe("a#0");
    expect(end.status).toBe("timedout");
    expect(state.terminated).toBe(true);
    expect(seen[seen.length - 1].type).toBe("run:end");
  });

  it("times out during collection when no test ever starts", async () => {
    const { transport, state } = fakeTransport();
    const seen: TestEvent[] = [];
    await runTests(emptyRequest, transport, (e) => seen.push(e), { noProgressTimeoutMs: 30 });
    expect(seen.map((e) => e.type)).toEqual(["run:end"]);
    expect(state.terminated).toBe(true);
  });

  it("does not time out while events keep arriving", async () => {
    const { transport, send } = fakeTransport();
    const seen: TestEvent[] = [];
    const done = runTests(emptyRequest, transport, (e) => seen.push(e), {
      noProgressTimeoutMs: 40,
    });

    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 20));
      send({ type: "test:end", id: `a#${i}`, status: "passed", durationMs: 1 });
    }
    send({ type: "run:end", durationMs: 60 });
    await done;

    expect(seen.filter((e) => e.type === "test:end").every((e: any) => e.status === "passed")).toBe(true);
  });
});
