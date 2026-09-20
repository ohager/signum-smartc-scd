import { useCallback, useEffect, useState } from "react";
import { useFileSystem } from "@/hooks/use-file-system.ts";
import { findProjectOfFolder } from "@/features/project/project-root";
import {
  contractOfProject,
  type ContractChoice,
} from "@/features/project/contract";
import type { FileMetadata, ProjectStatusRecord } from "@/lib/file-system";

/**
 * The project the route is in, and the facts the rail reports about it.
 *
 * 1. **The route's `:projectId` is not the project.** `files-page.tsx:75`
 *    rewrites the URL to the file's *immediate* parent folder, so it names a
 *    subfolder whenever the contract is nested — and the status key, the file
 *    listing and the cells' navigation targets would then all describe `src`
 *    while claiming to describe the project. Resolved once, here.
 * 2. **`FileSystem` is not reactive.** A `useMemo` over it never re-runs, so
 *    the scenario count, the timestamps and the verdicts would freeze until
 *    the next navigation — and the staleness rule, which exists precisely to
 *    compare those timestamps, would never fire. `use-recent-files.ts` is the
 *    subscription this copies.
 * 3. **`listFilesRecursive` throws** on a folder it cannot find, and the rail
 *    renders in the page header of every `/projects/*` route. A stale URL, or
 *    a project another tab deleted, would otherwise take the header down.
 */

export interface ProjectFacts {
  /** The real project, not what the URL said. Empty string when there is none. */
  projectId: string;
  files: FileMetadata[];
  contract: ContractChoice<FileMetadata> | null;
  status: ProjectStatusRecord;
}

const NOTHING: ProjectFacts = {
  projectId: "",
  files: [],
  contract: null,
  status: { tests: {} },
};

export function useProjectFacts(routeFolderId: string): ProjectFacts {
  const fs = useFileSystem();

  const read = useCallback((): ProjectFacts => {
    if (!routeFolderId) return NOTHING;

    const projectId = findProjectOfFolder(fs, routeFolderId);
    if (!projectId) return NOTHING;

    try {
      const files = fs.listFilesRecursive(projectId);
      return {
        projectId,
        files,
        contract: contractOfProject(files),
        status: fs.status.of(projectId),
      };
    } catch {
      // The project went away between resolving it and listing it.
      return NOTHING;
    }
  }, [fs, routeFolderId]);

  const [facts, setFacts] = useState(read);

  useEffect(() => {
    const refresh = () => setFacts(read());

    refresh();
    fs.addEventListener("file:*", refresh);
    fs.addEventListener("folder:*", refresh);
    fs.addEventListener("fs:reloaded", refresh);
    // The one the verdicts arrive on — a test run writes no file.
    fs.addEventListener("status:updated", refresh);
    return () => {
      fs.removeEventListener("file:*", refresh);
      fs.removeEventListener("folder:*", refresh);
      fs.removeEventListener("fs:reloaded", refresh);
      fs.removeEventListener("status:updated", refresh);
    };
  }, [fs, read]);

  return facts;
}
