import type { ToolOutcome } from "@smartc-studio/assistant-protocol";
import { MAX_CHECKPOINTS, captureProject, type Checkpoint, type CheckpointFile, type CheckpointStore } from "../rounds/checkpoints";
import { createRoundHooks } from "../rounds/round-hooks";
import { RoundTracker, type Clock } from "../rounds/round-tracker";
import type { WorkspaceFs } from "../tools/paths";
import { composeHandlers, createProjectOf, createToolRegistry, type RegistryEvents } from "../tools/registry";
import { createBuildTools, type BuildDeps } from "../tools/build-tools";
import { createTestTools, type TestToolDeps } from "../tools/test-tools";
import { createWorkspaceTools } from "../tools/workspace-tools";
import { loadRoundDiff, restoreRound, undoRestore } from "../activity/restore-round";
import { AssistantConnection } from "./connection";
import type { SocketLike } from "./rpc";

type RoundStarted = { projectId: string; roundId: string; checkpointId: string; at: number };
type RoundEnded = { projectId: string; roundId: string; reason: "idle" | "takeover" | "disconnect"; at: number };
type CallStarted = Parameters<RegistryEvents["callStarted"]>[0];
type CallEnded = Parameters<RegistryEvents["callEnded"]>[0];

export interface RuntimeEventListener {
  onRoundStarted(e: RoundStarted): void;
  onRoundEnded(e: RoundEnded): void;
  onCallStarted(e: CallStarted): void;
  onCallEnded(e: CallEnded): void;
}

export interface AssistantRuntimeDeps {
  fs: WorkspaceFs;
  checkpointStore: CheckpointStore;
  clock: Clock;
  openSocket: (url: string) => SocketLike;
  flush: () => Promise<void>;
  lock: (projectId: string) => void;
  unlock: (projectId: string) => void;
  catalogHash: string;
  studioVersion: string;
  idleMs?: number;
  tools: {
    loadLabelMaps: BuildDeps["loadLabelMaps"];
    lint: BuildDeps["lint"];
    gas: BuildDeps["gas"];
    execute: TestToolDeps["execute"];
    recordVerdicts: TestToolDeps["recordVerdicts"];
  };
  /* The editor tools talk to mounted Monaco editors and the router, so the UI layer supplies them. */
  editor: Parameters<typeof composeHandlers>[0]["editor"];
}

export const IDLE_MS = 60_000;

/*
 * The non-React core: composes bridge, registry, rounds and tools from injected
 * collaborators so the whole chain is testable with a fake socket and memory stores.
 */
export function createAssistantRuntime(deps: AssistantRuntimeDeps) {
  const listeners = new Set<Partial<RuntimeEventListener>>();
  /* A listener is UI code; it must never be able to fail a tool call or a round change. */
  function emit<K extends keyof RuntimeEventListener>(name: K, e: Parameters<RuntimeEventListener[K]>[0]): void {
    for (const l of [...listeners]) {
      try {
        (l[name] as ((x: typeof e) => void) | undefined)?.(e);
      } catch {
        /* swallowed on purpose */
      }
    }
  }

  const endSnapshots = new Map<string, CheckpointFile[]>();
  const roundCheckpoints = new Map<string, { projectId: string; checkpointId: string }>();

  const hooks = createRoundHooks({
    flush: deps.flush,
    async capture(projectId) {
      const cp: Checkpoint = {
        id: crypto.randomUUID(),
        projectId,
        createdAt: deps.clock.now(),
        reason: "round-start",
        files: await captureProject(deps.fs, projectId),
      };
      await deps.checkpointStore.put(cp);
      await deps.checkpointStore.prune(projectId, MAX_CHECKPOINTS);
      return cp;
    },
    lock: deps.lock,
    unlock: deps.unlock,
    async endSnapshot(projectId, roundId) {
      endSnapshots.set(roundId, await captureProject(deps.fs, projectId));
    },
    notify: {
      roundStarted(e) {
        roundCheckpoints.set(e.roundId, { projectId: e.projectId, checkpointId: e.checkpointId });
        emit("onRoundStarted", e);
      },
      roundEnded: (e) => emit("onRoundEnded", e),
    },
  });

  const rounds = new RoundTracker({ idleMs: deps.idleMs ?? IDLE_MS, clock: deps.clock, hooks });

  const workspace = createWorkspaceTools(deps.fs);
  const build = createBuildTools(deps.fs, {
    loadLabelMaps: deps.tools.loadLabelMaps,
    lint: deps.tools.lint,
    gas: deps.tools.gas,
  });
  const test = createTestTools({ fs: deps.fs, execute: deps.tools.execute, recordVerdicts: deps.tools.recordVerdicts });

  const registry = createToolRegistry({
    handlers: composeHandlers({ workspace, build, test, editor: deps.editor }),
    rounds,
    projectOf: createProjectOf(deps.fs),
    events: { callStarted: (e) => emit("onCallStarted", e), callEnded: (e) => emit("onCallEnded", e) },
    clock: deps.clock,
  });

  const connection = new AssistantConnection({
    openSocket: deps.openSocket,
    onCall: (tool, args): Promise<ToolOutcome> => registry.call(tool, args),
    onDisconnected: () => void rounds.endAll("disconnect").catch(() => {}),
    studioVersion: deps.studioVersion,
    catalogHash: deps.catalogHash,
  });

  const restoreDeps = {
    fs: deps.fs,
    store: deps.checkpointStore,
    clock: deps.clock,
    checkpointOf: (roundId: string) => roundCheckpoints.get(roundId),
    endSnapshotOf: (roundId: string) => endSnapshots.get(roundId),
    isRunning: (roundId: string) => roundCheckpoints.has(roundId) && !endSnapshots.has(roundId),
    takeOver: (projectId: string) => rounds.takeOver(projectId),
  };

  return {
    connection,
    rounds,
    takeOver: (projectId: string) => rounds.takeOver(projectId),
    events: {
      subscribe(listener: Partial<RuntimeEventListener>): () => void {
        listeners.add(listener);
        return () => void listeners.delete(listener);
      },
    },
    /*
     * A round is running exactly until its end snapshot exists, so no caller has to
     * pass (and possibly get wrong) whether it is still live.
     */
    restoreRound: (roundId: string) => restoreRound(restoreDeps, roundId),
    undoRestore: (undoCheckpointId: string) => undoRestore(restoreDeps, undoCheckpointId),
    loadDiff: (checkpointId: string, projectId: string, relPath: string) => loadRoundDiff(restoreDeps, checkpointId, projectId, relPath),
    /* Read-only views for the activity feed. */
    endSnapshotOf: (roundId: string): CheckpointFile[] | undefined => endSnapshots.get(roundId),
    checkpointOf: (roundId: string): { projectId: string; checkpointId: string } | undefined => roundCheckpoints.get(roundId),
  };
}

export type AssistantRuntime = ReturnType<typeof createAssistantRuntime>;

