/*
 * Pure decisions behind follow mode and the gutter baseline, kept free of React,
 * jotai and the router so the rules can be tested on their own.
 */
import { FileTypes } from "@/features/project/filetype-icons";
import type { CheckpointFile } from "./rounds/checkpoints";

/*
 * Types files-page renders an editor for. Keep in sync with its dispatch: anything else
 * shows "no longer supported" (today only Doc), and following the agent there would pull
 * the user off their contract onto a dead page.
 */
const FOLLOWABLE: ReadonlySet<string> = new Set([
  FileTypes.SmartC,
  FileTypes.ASM,
  FileTypes.Scenario,
  FileTypes.Test,
  FileTypes.Watchlist,
  FileTypes.LabelMap,
]);

export function isFollowable(type: string): boolean {
  return FOLLOWABLE.has(type);
}

/*
 * "open" only when follow mode is on, the user is already in the file's project and the
 * Studio can show the file: the assistant must never pull the user out of the project they
 * are working in, nor onto a page without an editor. Those files get the sidebar dot instead.
 */
export function decideFollow(args: {
  followMode: boolean;
  currentProjectId: string | null;
  touched: { fileId: string; projectId: string; type: string };
}): "open" | "dot" {
  return args.followMode && args.currentProjectId === args.touched.projectId && isFollowable(args.touched.type) ? "open" : "dot";
}

/*
 * Whether an editor may apply a follow reveal yet. The saved content reaches an open
 * editor through React state a render later; revealing before then would highlight
 * the old buffer. Line endings are normalised because Monaco's model may use its own EOL.
 */
export function readyToReveal(modelText: string, expectedText: string | undefined): boolean {
  if (expectedText === undefined) return true;
  const norm = (x: string) => x.replace(/\r\n/g, "\n");
  return norm(modelText) === norm(expectedText);
}

export interface BaselineState {
  /* What the gutter compares against, per project. */
  baseline: Readonly<Record<string, CheckpointFile[]>>;
  /* Projects in which a round has ended during this session. */
  settled: ReadonlySet<string>;
}

export const emptyBaselineState: BaselineState = { baseline: {}, settled: new Set() };

export type BaselineEvent =
  | { type: "roundStarted"; projectId: string; files: CheckpointFile[] | null }
  | { type: "roundEnded"; projectId: string; files: CheckpointFile[] | null };

/*
 * Decision 13: the baseline is the checkpoint of the last ENDED round, so markers
 * stay until the next round of that project ends. Only before any round has ended
 * does the running round's checkpoint serve, so the first round already shows its changes.
 * `files` is the checkpoint of the round the event is about; null means it could not be
 * loaded, which must read as "no baseline" (never as an empty project, which would show
 * every line as added).
 */
export function nextBaseline(state: BaselineState, event: BaselineEvent): BaselineState {
  if (event.type === "roundStarted") {
    if (event.files === null || state.settled.has(event.projectId)) return state;
    return { ...state, baseline: { ...state.baseline, [event.projectId]: event.files } };
  }
  const { [event.projectId]: _dropped, ...rest } = state.baseline;
  return {
    baseline: event.files === null ? rest : { ...rest, [event.projectId]: event.files },
    settled: new Set(state.settled).add(event.projectId),
  };
}
