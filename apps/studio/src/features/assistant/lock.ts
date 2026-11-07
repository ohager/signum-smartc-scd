import { FileSystem } from "@/lib/file-system";
import type { File } from "@/lib/file-system";
import { findProjectOfFolder } from "@/features/project/project-root";
import { jotaiStore } from "@/stores/jotai-store";
import { lockedProjectsAtom } from "./state";

/*
 * For callers outside React's render (event handlers): reads the lock set from the
 * store directly. The set holds top-level project ids, so the file's folder is mapped
 * through findProjectOfFolder first.
 */
export function isFileLocked(file: File): boolean {
  const projectId = findProjectOfFolder(FileSystem.getInstance(), file.metadata.folderId);
  return projectId !== null && jotaiStore.get(lockedProjectsAtom).has(projectId);
}
