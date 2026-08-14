import { useEffect, useState } from "react";
import { useFileSystem } from "./use-file-system";
import { findFolderChainToFile } from "@/features/project/tree-reveal";

/** A recent entry with its metadata resolved from the file system. */
export interface ResolvedRecent {
  fileId: string;
  /** The **root project** the file belongs to, not its immediate parent folder. */
  projectId: string;
  name: string;
  type: string;
  openedAt: number;
}

/**
 * Recently opened files, newest first, with names, types and projects resolved
 * live so renames and moves cannot produce a stale label or a dead link.
 * Pruning of deleted files happens in `FileSystem` itself.
 */
export function useRecentFiles(): ResolvedRecent[] {
  const fs = useFileSystem();
  const [recents, setRecents] = useState<ResolvedRecent[]>([]);

  useEffect(() => {
    const refresh = () => {
      const resolved: ResolvedRecent[] = [];
      for (const entry of fs.recents.list()) {
        const metadata = fs.getFileMetadata(entry.fileId);
        // `getFolderIdOfFile` gives the *immediate* parent, which for a nested
        // file is a subfolder ("src"), not the project the row should name.
        // The reveal chain starts at the top-level project, so take its head.
        const projectId = findFolderChainToFile(fs, entry.fileId)[0];
        if (!metadata || !projectId) continue;
        resolved.push({
          fileId: entry.fileId,
          projectId,
          name: metadata.name,
          type: metadata.type,
          openedAt: entry.openedAt,
        });
      }
      setRecents(resolved);
    };

    refresh();
    fs.addEventListener("file:*", refresh);
    fs.addEventListener("folder:*", refresh);
    return () => {
      fs.removeEventListener("file:*", refresh);
      fs.removeEventListener("folder:*", refresh);
    };
  }, []);

  return recents;
}
