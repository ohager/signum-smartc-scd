/** The bit of the file system the tree walk needs — keeps this testable. */
export interface FolderTree {
  listFolderContents(folderId?: string): {
    folders: { id: string }[];
    files: { id: string }[];
  };
}

/**
 * Ids of the folders that must be expanded to make `fileId` visible in the
 * sidebar: the top-level project, every folder in between, and the folder that
 * holds the file. Returns an empty array when the file is not in the tree.
 */
export function findFolderChainToFile(tree: FolderTree, fileId: string): string[] {
  const visit = (folderId: string): string[] | null => {
    const { folders, files } = tree.listFolderContents(folderId);
    if (files.some((f) => f.id === fileId)) return [folderId];
    for (const sub of folders) {
      const chain = visit(sub.id);
      if (chain) return [folderId, ...chain];
    }
    return null;
  };

  // Root files are not rendered in the tree, so start at the projects.
  for (const project of tree.listFolderContents().folders) {
    const chain = visit(project.id);
    if (chain) return chain;
  }
  return [];
}
