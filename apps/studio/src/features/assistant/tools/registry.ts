import { DEFAULT_HINTS, toolDef, type AssistantError, type ToolArgs, type ToolName, type ToolOutcome } from "@smartc-studio/assistant-protocol";
import type { RoundTracker, Clock } from "../rounds/round-tracker";
import { AssistantFailure } from "./errors";
import { resolveProject, resolveWorkspacePath, type WorkspaceFs } from "./paths";

export interface TouchedFile {
  fileId: string;
  projectId: string;
}

export type ToolHandlers = {
  [N in ToolName]: (args: ToolArgs<N>) => Promise<{ result: unknown; touched?: TouchedFile[] }>;
};

export interface RegistryEvents {
  callStarted(e: { callId: string; tool: ToolName; projectId: string | null; target: string | null; at: number }): void;
  callEnded(e: { callId: string; outcome: ToolOutcome; touched: TouchedFile[]; at: number }): void;
}

export interface ToolRegistryDeps {
  handlers: ToolHandlers;
  rounds: Pick<RoundTracker, "begin" | "finish">;
  projectOf: (tool: ToolName, args: unknown) => string | null;
  events: RegistryEvents;
  clock: Clock;
}

const INTERNAL_HINT = "This is a Studio bug; report it and continue with another approach.";

function failure(code: AssistantError["code"], message: string, hint: string = DEFAULT_HINTS[code]): ToolOutcome {
  return { ok: false, error: { code, message, hint } };
}

function toOutcome(err: unknown): ToolOutcome {
  if (err instanceof AssistantFailure) return failure(err.code, err.message, err.hint);
  return failure("internal", err instanceof Error ? err.message : String(err), INTERNAL_HINT);
}

/* Wraps the plain-result tool factories so every handler has the one registry shape. */
export function asHandler<A, R>(fn: (args: A) => Promise<R> | R): (args: A) => Promise<{ result: R }> {
  return async (args) => ({ result: await fn(args) });
}

type Plain<N extends ToolName> = (args: ToolArgs<N>) => Promise<unknown> | unknown;

export function composeHandlers(parts: {
  workspace: Pick<ToolHandlers, "list_projects" | "list_files" | "read_file" | "write_file" | "edit_file" | "delete_file" | "create_project">;
  build: { compile: (a: ToolArgs<"compile">) => Promise<{ result: unknown }>; analyze_gas: (a: ToolArgs<"analyze_gas">) => Promise<{ result: unknown }>; lint: (a: ToolArgs<"lint">) => Promise<{ result: unknown }> };
  test: { run_tests: (a: ToolArgs<"run_tests">) => Promise<{ result: unknown }> };
  editor: { get_editor_context: Plain<"get_editor_context">; open_file: Plain<"open_file"> };
}): ToolHandlers {
  /*
   * Build and test tools already return `{result}`; the editor tools return plain
   * values. Only the latter get wrapped so nothing is double-wrapped.
   */
  return {
    list_projects: parts.workspace.list_projects,
    list_files: parts.workspace.list_files,
    read_file: parts.workspace.read_file,
    write_file: parts.workspace.write_file,
    edit_file: parts.workspace.edit_file,
    delete_file: parts.workspace.delete_file,
    create_project: parts.workspace.create_project,
    compile: parts.build.compile,
    analyze_gas: parts.build.analyze_gas,
    lint: parts.build.lint,
    run_tests: parts.test.run_tests,
    get_editor_context: asHandler(parts.editor.get_editor_context),
    open_file: asHandler(parts.editor.open_file),
  };
}

const PATH_TOOLS = new Set<ToolName>(["read_file", "write_file", "edit_file", "delete_file", "open_file", "compile", "analyze_gas", "lint"]);

/* The real `projectOf`; kept out of the registry so the registry never sees the file system. */
export function createProjectOf(fs: WorkspaceFs): (tool: ToolName, args: unknown) => string | null {
  return (tool, args) => {
    const a = args as { path?: string; project?: string };
    if (PATH_TOOLS.has(tool)) return resolveWorkspacePath(fs, a.path!, toolDef(tool)!.kind === "write" ? "write" : "read").projectId;
    if (tool === "list_files" || tool === "run_tests") return resolveProject(fs, a.project!);
    return null;
  };
}

/*
 * Every agent call lands here. Reads and writes of one project run strictly one at a
 * time: a read must not observe a half-applied write, and it keeps the tracker's
 * in-flight count at most 1 so `finish` can never be stale. Global tools bypass both
 * queue and rounds. Arguments are validated again because the Studio must not trust
 * the relay, and every failure leaves as one `{ok:false, error}` shape.
 */
export function createToolRegistry(deps: ToolRegistryDeps): { call(tool: string, args: unknown): Promise<ToolOutcome> } {
  const queues = new Map<string, Promise<unknown>>();
  let nextCallId = 1;

  function enqueue<T>(projectId: string, job: () => Promise<T>): Promise<T> {
    const prev = queues.get(projectId) ?? Promise.resolve();
    // Jobs never reject (callers catch), but swallow anyway so one bug cannot wedge the project.
    const run = prev.then(job, job);
    const tail = run.then(
      () => {},
      () => {},
    );
    queues.set(projectId, tail);
    void tail.then(() => {
      if (queues.get(projectId) === tail) queues.delete(projectId);
    });
    return run;
  }

  async function withRound<T>(projectId: string, kind: "read" | "write", job: () => Promise<T>): Promise<T> {
    await deps.rounds.begin(projectId, kind);
    try {
      return await job();
    } finally {
      deps.rounds.finish(projectId);
    }
  }

  async function execute(tool: ToolName, kind: "global" | "read" | "write", args: unknown, projectId: string | null): Promise<{ outcome: ToolOutcome; touched: TouchedFile[] }> {
    try {
      const handler = deps.handlers[tool] as (a: unknown) => Promise<{ result: unknown; touched?: TouchedFile[] }>;
      if (kind === "global" || projectId === null) {
        const out = await handler(args);
        const touched = out.touched ?? [];
        if (tool === "create_project") {
          const newProject = touched[0]?.projectId;
          if (newProject) {
            // Begun after creation so the checkpoint holds the starter files (ruling P5).
            await enqueue(newProject, () => withRound(newProject, "write", async () => {}));
          }
        }
        return { outcome: { ok: true, data: out.result }, touched };
      }
      return await enqueue(projectId, async () => {
        try {
          const out = await withRound(projectId, kind, () => handler(args));
          return { outcome: { ok: true, data: out.result } as ToolOutcome, touched: out.touched ?? [] };
        } catch (err) {
          return { outcome: toOutcome(err), touched: [] };
        }
      });
    } catch (err) {
      return { outcome: toOutcome(err), touched: [] };
    }
  }

  return {
    async call(toolName, args) {
      const def = toolDef(toolName);
      if (!def) return failure("protocol_mismatch", `Unknown tool "${toolName}".`);
      const tool = def.name;
      const callId = String(nextCallId++);
      const raw = (args ?? {}) as { path?: unknown; project?: unknown };
      const target = typeof raw.path === "string" ? raw.path : typeof raw.project === "string" ? raw.project : null;

      let projectId: string | null = null;
      let outcome: ToolOutcome;
      let touched: TouchedFile[] = [];

      const parsed = def.input.safeParse(args ?? {});
      if (!parsed.success) {
        deps.events.callStarted({ callId, tool, projectId, target, at: deps.clock.now() });
        const issues = parsed.error.issues.map((i) => `${i.path.join(".") || "(args)"}: ${i.message}`).join("\n");
        outcome = failure("internal", `Invalid arguments for ${tool}:\n${issues}`, INTERNAL_HINT);
      } else {
        try {
          projectId = deps.projectOf(tool, parsed.data);
        } catch (err) {
          deps.events.callStarted({ callId, tool, projectId: null, target, at: deps.clock.now() });
          const o = toOutcome(err);
          deps.events.callEnded({ callId, outcome: o, touched: [], at: deps.clock.now() });
          return o;
        }
        deps.events.callStarted({ callId, tool, projectId, target, at: deps.clock.now() });
        ({ outcome, touched } = await execute(tool, def.kind, parsed.data, projectId));
      }
      deps.events.callEnded({ callId, outcome, touched, at: deps.clock.now() });
      return outcome;
    },
  };
}
