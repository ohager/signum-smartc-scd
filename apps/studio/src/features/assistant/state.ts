import { atom } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { DEFAULT_RELAY_PORT } from "@smartc-studio/assistant-protocol";
import type { ConnectionState } from "./bridge/connection";
import type { FeedState } from "./activity/feed-model";
import type { CheckpointFile } from "./rounds/checkpoints";

/* The connection state machine's current state, mirrored here for React. */
export const connectionStateAtom = atom<ConnectionState>({ kind: "idle" });

/* Projects with an active round; editors become read-only while listed. */
export const lockedProjectsAtom = atom<ReadonlySet<string>>(new Set<string>());

/* Whether the editor follows the files the assistant touches. */
export const followModeAtom = atom(true);

/* Project snapshots taken at round start, keyed by project, for the diff gutter. */
export const baselineAtom = atom<Record<string, CheckpointFile[]>>({});

/* File ids the assistant touched in the current round. */
export const touchedFilesAtom = atom<ReadonlySet<string>>(new Set<string>());

/* The relay port the user last used; jotai's storage already tolerates unavailable storage. */
export const assistantPortAtom = atomWithStorage("scd:assistant-port", DEFAULT_RELAY_PORT);

/* Everything the agent did this session, grouped by round; deliberately never persisted. */
export const feedAtom = atom<FeedState>({ rounds: [], loose: [] });

/*
 * The last restore per project, so its undo stays one click away in the activity panel
 * until the next restore of that project (a toast alone is easy to miss). `undone` flips
 * on each undo, whose own checkpoint makes the undo reversible in turn.
 */
export const lastRestoreAtom = atom<Record<string, { roundId: string; undoCheckpointId: string; undone: boolean }>>({});
