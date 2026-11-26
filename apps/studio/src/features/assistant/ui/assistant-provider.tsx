import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation, useNavigate } from "react-router";
import { catalogHash } from "@smartc-studio/assistant-protocol";
import { FileSystem } from "@/lib/file-system";
import { flushPendingSaves } from "@/lib/pending-saves";
import { APP_VERSION } from "@/lib/version";
import { jotaiStore } from "@/stores/jotai-store";
import { loadLabelMaps } from "@/features/inspector/workspace/label-map-index";
import { AssistantContext } from "../bridge/use-assistant";
import { createAssistantRuntime, type AssistantRuntime } from "../bridge/assistant-runtime";
import type { SocketLike } from "../bridge/rpc";
import { IdbCheckpointStore } from "../rounds/idb-checkpoint-store";
import { editorRegistry } from "../editor-registry";
import { createEditorTools } from "../tools/editor-tools";
import { assistantGas, assistantLint } from "../tools/analysis-adapters";
import { createStudioRecordVerdicts, createStudioTestExecute } from "../tools/studio-test-execute";
import { baselineAtom, feedAtom, followModeAtom, lockedProjectsAtom, touchedFilesAtom, recordConnectionState } from "../state";
import { findProjectOfFolder } from "@/features/project/project-root";
import { wireFollow, type FollowRoute } from "./follow-wiring";
import { feedReducer, type FeedEvent } from "../activity/feed-model";
import { ApprovalDialog } from "./approval-dialog";

function setLocked(projectId: string, locked: boolean) {
  const next = new Set(jotaiStore.get(lockedProjectsAtom));
  if (locked) next.add(projectId);
  else next.delete(projectId);
  jotaiStore.set(lockedProjectsAtom, next);
}

/* The real collaborators, built once; everything testable lives in createAssistantRuntime. */
function buildRuntime(hash: string, navigate: (path: string) => void, route: () => FollowRoute): AssistantRuntime {
  const fs = FileSystem.getInstance();
  const checkpointStore = new IdbCheckpointStore();
  const runtime = createAssistantRuntime({
    fs,
    checkpointStore,
    clock: { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h as number) },
    openSocket: (url) => new WebSocket(url) as unknown as SocketLike, // a browser WebSocket satisfies the subset the bridge uses
    flush: flushPendingSaves,
    lock: (id) => setLocked(id, true),
    unlock: (id) => setLocked(id, false),
    editor: createEditorTools({ registry: editorRegistry, navigate, fs }),
    catalogHash: hash,
    studioVersion: APP_VERSION,
    tools: {
      loadLabelMaps: () => loadLabelMaps(fs),
      lint: assistantLint,
      gas: assistantGas,
      execute: createStudioTestExecute(),
      recordVerdicts: createStudioRecordVerdicts(),
    },
  });
  const dispatch = (event: FeedEvent) => jotaiStore.set(feedAtom, (feed) => feedReducer(feed, event));
  runtime.events.subscribe({
    onRoundStarted: (e) => dispatch({ type: "round:start", ...e }),
    onRoundEnded: (e) => dispatch({ type: "round:end", roundId: e.roundId, at: e.at }),
    onCallStarted: (e) => dispatch({ type: "call:start", ...e }),
    onCallEnded: (e) => dispatch({ type: "call:end", ...e }),
  });
  runtime.events.subscribe(
    wireFollow({
      fs,
      checkpointStore,
      registry: editorRegistry,
      navigate,
      route,
      followMode: () => jotaiStore.get(followModeAtom),
      setBaseline: (baseline) => jotaiStore.set(baselineAtom, { ...baseline }),
      markTouched: (fileId) => jotaiStore.set(touchedFilesAtom, (prev) => new Set(prev).add(fileId)),
    }),
  );
  runtime.connection.subscribe((s) => recordConnectionState(jotaiStore, s));
  return runtime;
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [runtime, setRuntime] = useState<AssistantRuntime | null>(null);
  /*
   * The runtime is built once, but react-router's navigate may change identity, so the
   * runtime calls through a ref. AssistantProvider sits under AppLayout, inside the router.
   */
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  navigateRef.current = navigate;
  /*
   * Follow mode needs to know which project the user is in. The route's folder id may be
   * a subfolder (the files page rewrites it to the file's parent), so it is mapped to the project.
   */
  const { pathname } = useLocation();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  useEffect(() => {
    let cancelled = false;
    let built: AssistantRuntime | null = null;
    // The hash is async, so the runtime appears once it is ready and Connect stays disabled until then.
    void catalogHash().then((hash) => {
      if (cancelled) return;
      built = buildRuntime(
        hash,
        (path) => void navigateRef.current(path),
        () => {
          const match = /^\/projects\/([^/]+)\/files\/([^/]+)/.exec(pathnameRef.current);
          if (!match) return { projectId: null, fileId: null };
          return { projectId: findProjectOfFolder(FileSystem.getInstance(), match[1]!), fileId: match[2]! };
        },
      );
      setRuntime(built);
    });
    return () => {
      cancelled = true;
      built?.connection.disconnect();
    };
  }, []);

  return (
    <AssistantContext.Provider value={runtime}>
      {children}
      <ApprovalDialog />
    </AssistantContext.Provider>
  );
}
