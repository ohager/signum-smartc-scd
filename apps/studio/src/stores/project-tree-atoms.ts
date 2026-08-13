import { atom } from "jotai";

/**
 * A one-shot "reveal this file in the project tree" request: every folder in
 * `folderIds` expands itself, the matching file item scrolls into view and
 * clears the request. Each request is a fresh object so that clicking reveal
 * again for the same file re-triggers the scroll.
 */
export interface RevealFileRequest {
  fileId: string;
  folderIds: ReadonlySet<string>;
}

export const revealFileRequestAtom = atom<RevealFileRequest | null>(null);
