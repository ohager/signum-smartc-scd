import { describe, it, expect } from "bun:test";
import { CATALOG, type ToolName, type ToolOutcome } from "@smartc-studio/assistant-protocol";
import { RoundTracker, type Clock, type RoundHooks } from "../rounds/round-tracker";
import { AssistantFailure } from "./errors";
import {
  asHandler,
  composeHandlers,
  createProjectOf,
  createToolRegistry,
  type RegistryEvents,
  type ToolHandlers,
} from "./registry";
import { createTestFs } from "./test-fs";

const clock: Clock = {
  now: () => 42,
  setTimeout: () => 0,
  clearTimeout: () => {},
};

/* Timers fire only when the test advances time, so a queue wait is deterministic. */
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
  advance(ms: number) {
    this.t += ms;
    for (const [id, timer] of [...this.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at > this.t) break;
      this.timers.delete(id);
      timer.fn();
    }
  }
  pending() {
    return this.timers.size;
  }
}

function harness(overrides: Partial<Record<ToolName, (args: any) => Promise<any>>> = {}, projectOf?: (t: ToolName, a: any) => string | null, registryClock: Clock = clock) {
  const log: string[] = [];
  let starts = 0;
  const hooks: RoundHooks = {
    async start(projectId) {
      starts++;
      log.push("flush", "capture", "lock");
      await Promise.resolve();
      return { roundId: `r${starts}-${projectId}`, checkpointId: "cp" };
    },
    async end() {},
  };
  const tracker = new RoundTracker({ idleMs: 1000, clock, hooks });
  const handlers = Object.fromEntries(
    CATALOG.map((d) => [d.name, async () => ({ result: { tool: d.name } })]),
  ) as unknown as Record<ToolName, (args: any) => Promise<any>>;
  Object.assign(handlers, overrides);
  const events: { started: any[]; ended: any[] } = { started: [], ended: [] };
  const ev: RegistryEvents = { callStarted: (e) => events.started.push(e), callEnded: (e) => events.ended.push(e) };
  const registry = createToolRegistry({
    handlers: handlers as unknown as ToolHandlers,
    rounds: tracker,
    projectOf: projectOf ?? ((tool, args: any) => (tool === "create_project" || tool === "list_projects" || tool === "get_editor_context" ? null : "p1")),
    events: ev,
    clock: registryClock,
  });
  return { registry, tracker, log, events, starts: () => starts };
}

const err = (o: ToolOutcome) => (o.ok ? null : o.error);

describe("createToolRegistry", () => {
  it("serialises parallel writes into one round start", async () => {
    let n = 0;
    const h = harness({
      write_file: async () => {
        const id = ++n;
        h.log.push(`write#${id}`);
        await new Promise((r) => setTimeout(r, 5));
        return { result: {} };
      },
    });
    const [a, b] = await Promise.all([
      h.registry.call("write_file", { path: "/p/a", content: "x" }),
      h.registry.call("write_file", { path: "/p/b", content: "y" }),
    ]);
    expect(a.ok && b.ok).toBe(true);
    expect(h.starts()).toBe(1);
    expect(h.log).toEqual(["flush", "capture", "lock", "write#1", "write#2"]);
  });

  it("queues reads behind writes of the same project but not other projects", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = harness(
      {
        write_file: async () => {
          order.push("w-start");
          await gate;
          order.push("w-end");
          return { result: {} };
        },
        read_file: async (a: any) => {
          order.push(`read:${a.path}`);
          return { result: {} };
        },
      },
      (_t, a: any) => (a.path.startsWith("/q") ? "p2" : "p1"),
    );
    const w = h.registry.call("write_file", { path: "/p/a", content: "x" });
    const r1 = h.registry.call("read_file", { path: "/p/a" });
    const r2 = h.registry.call("read_file", { path: "/q/a" });
    await r2;
    expect(order).toContain("read:/q/a");
    expect(order).not.toContain("read:/p/a");
    release();
    await Promise.all([w, r1]);
    expect(order.indexOf("w-end")).toBeLessThan(order.indexOf("read:/p/a"));
  });

  it("keeps the queue alive after a failing call", async () => {
    const h = harness({
      write_file: async () => {
        throw new Error("x");
      },
    });
    await h.registry.call("write_file", { path: "/p/a", content: "x" });
    const ok = await h.registry.call("read_file", { path: "/p/a" });
    expect(ok.ok).toBe(true);
  });

  it("global calls skip rounds and queues", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const h = harness({
      write_file: async () => {
        await gate;
        return { result: {} };
      },
    });
    const w = h.registry.call("write_file", { path: "/p/a", content: "x" });
    const g = await h.registry.call("list_projects", {});
    expect(g).toEqual({ ok: true, data: { tool: "list_projects" } });
    release();
    await w;
    const before = h.starts();
    await h.registry.call("get_editor_context", {});
    expect(h.starts()).toBe(before);
  });

  it("maps AssistantFailure and unknown errors", async () => {
    const h = harness({
      read_file: async () => {
        throw new AssistantFailure("file_not_found", "nope");
      },
      lint: async () => {
        throw new Error("kaboom");
      },
    });
    const a = await h.registry.call("read_file", { path: "/p/a" });
    expect(err(a)).toMatchObject({ code: "file_not_found", message: "nope" });
    expect(err(a)!.hint.length).toBeGreaterThan(0);
    const b = await h.registry.call("lint", { path: "/p/a" });
    expect(b).toEqual({
      ok: false,
      error: { code: "internal", message: "kaboom", hint: "This is a Studio bug; report it and continue with another approach." },
    });
  });

  it("rejects unknown tools with protocol_mismatch", async () => {
    const h = harness();
    const o = await h.registry.call("deploy", {});
    expect(err(o)!.code).toBe("protocol_mismatch");
    expect(err(o)!.hint.length).toBeGreaterThan(0);
  });

  it("re-validates args and lists issues one per line", async () => {
    const h = harness();
    const o = await h.registry.call("write_file", { path: "nope", content: 5, extra: 1 });
    expect(err(o)!.code).toBe("internal");
    expect(err(o)!.message.split("\n").length).toBeGreaterThan(1);
    expect(h.starts()).toBe(0);
  });

  describe("queue deadline", () => {
    const tick = () => new Promise((r) => setTimeout(r, 0));

    function blockedBehindTests() {
      const fake = new FakeClock();
      let release!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const writes: string[] = [];
      const h = harness(
        {
          run_tests: async () => {
            await gate;
            return { result: "tests" };
          },
          write_file: async (a: any) => {
            writes.push(a.path);
            return { result: {} };
          },
        },
        undefined,
        fake,
      );
      return { h, fake, release, writes };
    }

    it("a queued call that has not started within its tool's timeout resolves timeout without running", async () => {
      const { h, fake, release, writes } = blockedBehindTests();
      const tests = h.registry.call("run_tests", { project: "p" });
      const write = h.registry.call("write_file", { path: "/p/a", content: "x" });
      await tick();
      fake.advance(10_000);
      const o = await write;
      expect(err(o)!.code).toBe("timeout");
      expect(err(o)!.message).toContain("was not run");
      expect(h.events.ended.map((e) => e.outcome.ok)).toEqual([false]);

      release();
      expect((await tests).ok).toBe(true);
      await tick();
      expect(writes).toEqual([]);
      expect(h.starts()).toBe(0);
      /* The queue is still alive. */
      expect((await h.registry.call("write_file", { path: "/p/b", content: "y" })).ok).toBe(true);
      expect(writes).toEqual(["/p/b"]);
    });

    it("a queued call that starts in time runs normally and its deadline is dropped", async () => {
      const { h, fake, release, writes } = blockedBehindTests();
      const tests = h.registry.call("run_tests", { project: "p" });
      const write = h.registry.call("write_file", { path: "/p/a", content: "x" });
      await tick();
      fake.advance(9_999);
      release();
      expect((await tests).ok).toBe(true);
      expect((await write).ok).toBe(true);
      expect(writes).toEqual(["/p/a"]);
      fake.advance(60_000);
      expect(h.events.ended.every((e) => e.outcome.ok)).toBe(true);
    });
  });

  it("projectOf failure is the outcome, without round or queue", async () => {
    const h = harness({}, () => {
      throw new AssistantFailure("path_not_allowed", "bad path");
    });
    const o = await h.registry.call("read_file", { path: "/x/y" });
    expect(err(o)).toMatchObject({ code: "path_not_allowed" });
    expect(h.starts()).toBe(0);
    expect(h.events.ended.length).toBe(1);
  });

  it("user_took_over only for writes after takeover", async () => {
    const h = harness();
    await h.registry.call("write_file", { path: "/p/a", content: "x" });
    await h.tracker.takeOver("p1");
    expect(err(await h.registry.call("read_file", { path: "/p/a" }))).toBeNull();
    expect(err(await h.registry.call("write_file", { path: "/p/a", content: "x" }))!.code).toBe("user_took_over");
    // The failed begin must not unbalance later calls.
    expect((await h.registry.call("write_file", { path: "/p/a", content: "x" })).ok).toBe(true);
  });

  it("create_project begins a round in the new project", async () => {
    const h = harness({
      create_project: async () => ({
        result: { name: "n" },
        touched: [{ fileId: "f1", projectId: "new" }],
      }),
    });
    const o = await h.registry.call("create_project", { name: "n" });
    expect(o).toEqual({ ok: true, data: { name: "n" } });
    expect(h.starts()).toBe(1);
    expect(h.tracker.active("new")?.roundId).toBe("r1-new");
  });

  it("emits callStarted/callEnded with touched files", async () => {
    const touched = [{ fileId: "f", projectId: "p1" }];
    const h = harness({ write_file: async () => ({ result: { a: 1 }, touched }) });
    await h.registry.call("write_file", { path: "/p/a", content: "x" });
    await h.registry.call("list_files", { project: "p" });
    await h.registry.call("list_projects", {});
    expect(h.events.started[0]).toEqual({ callId: "1", tool: "write_file", projectId: "p1", target: "/p/a", at: 42 });
    expect(h.events.started[1]).toMatchObject({ callId: "2", target: "p" });
    expect(h.events.started[2]).toMatchObject({ callId: "3", projectId: null, target: null });
    expect(h.events.ended[0]).toEqual({ callId: "1", outcome: { ok: true, data: { a: 1 } }, touched, at: 42 });
    expect(h.events.ended[1].touched).toEqual([]);
  });
});

describe("composeHandlers / asHandler", () => {
  it("asHandler wraps a plain result", async () => {
    expect(await asHandler(async (a: { x: number }) => a.x + 1)({ x: 1 })).toEqual({ result: 2 });
  });

  it("composes all 13 tools", async () => {
    const out = async () => ({ result: 1 });
    const h = composeHandlers({
      workspace: { list_projects: out, list_files: out, read_file: out, write_file: out, edit_file: out, delete_file: out, create_project: out } as any,
      build: { compile: async () => ({ result: 2 }), analyze_gas: async () => ({ result: 2 }), lint: async () => ({ result: 2 }) } as any,
      test: { run_tests: async () => ({ result: 3 }) } as any,
      editor: { get_editor_context: async () => 4, open_file: async () => 5 } as any,
    });
    expect(Object.keys(h).sort()).toEqual(CATALOG.map((d) => d.name).sort());
    expect(await h.compile({ path: "/p/a" })).toEqual({ result: 2 });
    expect(await h.run_tests({ project: "p" })).toEqual({ result: 3 });
    expect(await h.open_file({ path: "/p/a" })).toEqual({ result: 5 });
  });
});

describe("createProjectOf", () => {
  it("resolves path tools, project tools and nulls", async () => {
    const { fs } = createTestFs();
    const p = await fs.createFolder(fs.rootFolderId, "proj");
    await fs.addFile(p, "a.ts", "test", "x");
    const projectOf = createProjectOf(fs);
    expect(projectOf("read_file", { path: "/proj/a.ts" })).toBe(p);
    expect(projectOf("list_files", { project: "proj" })).toBe(p);
    expect(projectOf("run_tests", { project: "proj" })).toBe(p);
    expect(projectOf("create_project", { name: "z" })).toBeNull();
    expect(projectOf("list_projects", {})).toBeNull();
    expect(projectOf("get_editor_context", {})).toBeNull();
    expect(() => projectOf("read_file", { path: "/nope/a.ts" })).toThrow(AssistantFailure);
    expect(() => projectOf("list_files", { project: "nope" })).toThrow(AssistantFailure);
  });
});
