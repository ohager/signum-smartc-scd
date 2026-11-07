/*
 * Pure decisions behind follow mode and the gutter baseline, kept free of React,
 * jotai and the router so the rules can be tested on their own.
 */
import type { CheckpointFile } from "./rounds/checkpoints";

/*
 * "open" only when follow mode is on and the user is already in the file's project:
 * the assistant must never pull the user out of the project they are working in.
 */
export function decideFollow(args: {
  followMode: boolean;
  currentProjectId: string | null;
  touched: { fileId: string; projectId: string };
}): "open" | "dot" {
  return args.followMode && args.currentProjectId === args.touched.projectId ? "open" : "dot";
}

export interface BaselineState {
  /* What the gutter compares against, per project. */
  baseline: Readonly<Record<string, CheckpointFile[]>>;
  /* Projects in which a round has ended during this session. */
  settled: ReadonlySet<string>;
}

export const emptyBaselineState: BaselineState = { baseline: {}, settled: new Set() };

export type BaselineEvent =
  | { type: "roundStarted"; projectId: string; files: CheckpointFile[] }
  | { type: "roundEnded"; projectId: string; files: CheckpointFile[] };

/*
 * Decision 13: the baseline is the checkpoint of the last ENDED round, so markers
 * stay until the next round of that project ends. Only before any round has ended
 * does the running round's checkpoint serve, so the first round already shows its changes.
 * `files` is always the checkpoint of the round the event is about.
 */
export function nextBaseline(state: BaselineState, event: BaselineEvent): BaselineState {
  if (event.type === "roundStarted") {
    if (state.settled.has(event.projectId)) return state;
    return { ...state, baseline: { ...state.baseline, [event.projectId]: event.files } };
  }
  return {
    baseline: { ...state.baseline, [event.projectId]: event.files },
    settled: new Set(state.settled).add(event.projectId),
  };
}
