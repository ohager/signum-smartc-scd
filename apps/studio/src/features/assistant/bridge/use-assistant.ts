import { createContext, useContext } from "react";
import { useAtomValue } from "jotai";
import { connectionStateAtom } from "../state";
import type { ConnectionState } from "./connection";
import type { RestorePlan } from "../activity/restore-round";
import type { AssistantRuntime } from "./assistant-runtime";

export { createAssistantRuntime } from "./assistant-runtime";

/* Null until the catalog hash is ready: the hello needs it, so nothing can connect earlier. */
export const AssistantContext = createContext<AssistantRuntime | null>(null);

export interface UseAssistant {
  state: ConnectionState;
  /** False while the catalog hash is still being computed; Connect waits for it. */
  ready: boolean;
  connect(port: number): void;
  allow(): void;
  deny(): void;
  disconnect(): void;
  takeOver(projectId: string): Promise<void>;
  /** Prepares a restore (taking over a running round); nothing is written until `confirm()`. */
  restore(roundId: string): Promise<RestorePlan>;
  undoRestore(undoCheckpointId: string): Promise<void>;
  loadDiff(checkpointId: string, projectId: string, relPath: string): ReturnType<AssistantRuntime["loadDiff"]>;
}

export function useAssistant(): UseAssistant {
  const runtime = useContext(AssistantContext);
  const state = useAtomValue(connectionStateAtom);
  return {
    state,
    ready: runtime !== null,
    connect: (port) => runtime?.connection.connect(port),
    allow: () => runtime?.connection.allow(),
    deny: () => runtime?.connection.deny(),
    disconnect: () => runtime?.connection.disconnect(),
    takeOver: async (projectId) => void (await runtime?.takeOver(projectId)),
    restore: async (roundId) => {
      if (!runtime) throw new Error("Assistant is not ready");
      return runtime.restoreRound(roundId);
    },
    undoRestore: async (id) => void (await runtime?.undoRestore(id)),
    loadDiff: async (checkpointId, projectId, relPath) => {
      if (!runtime) throw new Error("Assistant is not ready");
      return runtime.loadDiff(checkpointId, projectId, relPath);
    },
  };
}
