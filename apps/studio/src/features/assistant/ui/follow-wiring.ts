/*
 * Follow mode and the gutter baseline, wired to the runtime's events.
 *
 * Agent tool calls arrive whole, so there is no live typing to show. When a write
 * lands in a file of the project the user is in, the Studio opens it and flashes the
 * change; elsewhere only a sidebar dot marks the file, so focus is never stolen.
 * Everything the wiring touches is injected, so it stays free of React and the router.
 */
import { diffLines } from "../activity/line-diff";
import type { EditorRegistry, LineRange } from "../editor-registry";
import { decideFollow, emptyBaselineState, nextBaseline, type BaselineEvent, type BaselineState } from "../follow";
import type { RuntimeEventListener } from "../bridge/assistant-runtime";
import type { CheckpointFile, CheckpointStore } from "../rounds/checkpoints";
import type { WorkspaceFs } from "../tools/paths";

export interface FollowRoute {
  /* The top-level project of the routed file, never a subfolder id. */
  projectId: string | null;
  fileId: string | null;
}

export interface FollowDeps {
  fs: Pick<WorkspaceFs, "getFileMetadata" | "getFolder" | "loadFile">;
  checkpointStore: Pick<CheckpointStore, "get">;
  registry: Pick<EditorRegistry, "revealWhenReady">;
  navigate: (path: string) => void;
  route: () => FollowRoute;
  followMode: () => boolean;
  /* Mirrors of the jotai atoms, so tests need no store. */
  setBaseline: (baseline: Readonly<Record<string, CheckpointFile[]>>) => void;
  markTouched: (fileId: string) => void;
}

function relPathOf(fs: FollowDeps["fs"], projectId: string, path: string): string {
  return path.slice(fs.getFolder(projectId).path.length).replace(/^\//, "");
}

/* Where the editor should look: the first change, and every changed range for the flash. */
async function changesIn(deps: FollowDeps, fileId: string, projectId: string, files: CheckpointFile[] | undefined) {
  const meta = deps.fs.getFileMetadata(fileId);
  if (!meta) return null;
  const { content } = await deps.fs.loadFile<unknown>(fileId);
  if (typeof content !== "string") return { line: 1, highlight: [] as LineRange[], text: undefined };
  /* Without a baseline there is nothing to compare against; a diff against "" would flag every line. */
  if (!files) return { line: 1, highlight: [] as LineRange[], text: content };
  const before = files?.find((f) => f.relPath === relPathOf(deps.fs, projectId, meta.path))?.content;
  const changes = diffLines(typeof before === "string" ? before : "", content);
  return {
    line: changes[0]?.startLine ?? 1,
    highlight: changes.map((c) => ({ from: c.startLine, to: c.endLine })),
    text: content,
  };
}

export function wireFollow(deps: FollowDeps): Pick<RuntimeEventListener, "onRoundStarted" | "onRoundEnded" | "onCallEnded"> {
  /* The running round's checkpoint per project: the reference for "what did this round change". */
  const roundFiles = new Map<string, CheckpointFile[]>();
  let state: BaselineState = emptyBaselineState;
  /* Checkpoint loads are async; events must still be applied in the order they arrived. */
  let queue: Promise<void> = Promise.resolve();

  const apply = (event: BaselineEvent) => {
    state = nextBaseline(state, event);
    deps.setBaseline(state.baseline);
  };

  return {
    onRoundStarted(e) {
      queue = queue.then(async () => {
        /* A checkpoint that cannot be read means "no baseline", not an empty project. */
        const files = (await deps.checkpointStore.get(e.checkpointId).catch(() => undefined))?.files ?? null;
        if (files) roundFiles.set(e.projectId, files);
        else roundFiles.delete(e.projectId);
        apply({ type: "roundStarted", projectId: e.projectId, files });
      }).catch(() => {});
    },

    onRoundEnded(e) {
      queue = queue.then(() => {
        apply({ type: "roundEnded", projectId: e.projectId, files: roundFiles.get(e.projectId) ?? null });
      }).catch(() => {});
    },

    onCallEnded(e) {
      if (!e.outcome.ok || e.touched.length === 0) return;
      const seen = new Set<string>();
      let opened = false;
      for (const touched of e.touched) {
        if (seen.has(touched.fileId)) continue;
        seen.add(touched.fileId);
        /* A deleted file has nothing to open and no row to mark. */
        const meta = deps.fs.getFileMetadata(touched.fileId);
        if (!meta) continue;
        const route = deps.route();
        const decision = decideFollow({ followMode: deps.followMode(), currentProjectId: route.projectId, touched });
        /* One navigation per call: several "open" files would fight, so the rest get dots. */
        if (decision === "open" && !opened) {
          opened = true;
          void open(touched.fileId, touched.projectId, meta.folderId, route.fileId === touched.fileId);
        } else if (route.fileId !== touched.fileId) {
          deps.markTouched(touched.fileId);
        }
      }
    },
  };

  async function open(fileId: string, projectId: string, folderId: string, alreadyOpen: boolean) {
    /* Queued behind the baseline so a first-round call sees its own round's checkpoint. */
    await queue;
    const where = await changesIn(deps, fileId, projectId, roundFiles.get(projectId)).catch(() => null);
    if (!where) return;
    /*
     * Registered before navigating: if the editor mounts first, the request is applied on
     * registration. The editor itself waits until its text equals `where.text`, so an
     * already-open file is revealed only once it has adopted the written content.
     */
    deps.registry.revealWhenReady(fileId, where.line, where.highlight, where.text);
    if (!alreadyOpen) deps.navigate(`/projects/${folderId}/files/${fileId}`);
  }
}
