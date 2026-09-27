/**
 * Which project a folder belongs to.
 *
 * The route's `:projectId` is not reliably a project. `files-page.tsx:75`
 * rewrites the URL to the file's *immediate* parent folder, so a contract in
 * `src/` puts `src` in the URL — and everything keyed on that id (the status
 * record, the recursive file listing, the cells' navigation targets) would
 * then describe a subfolder while claiming to describe a project.
 *
 * `findFolderChainToFile` in `tree-reveal.ts` solves the same problem for a
 * file id, and `use-recent-files.ts` documents the trap. This is the folder
 * version, on the same structural interface so it tests against the same fake.
 */

/** The bit of the file system the walk needs — keeps this testable. */
export interface FolderTree {
  listFolderContents(folderId?: string): {
    folders: { id: string }[];
    files: { id: string }[];
  };
}

/** The top-level project `folderId` sits in or under, or null if it is in none. */
export function findProjectOfFolder(
  tree: FolderTree,
  folderId: string,
): string | null {
  const contains = (candidate: string): boolean =>
    candidate === folderId ||
    tree.listFolderContents(candidate).folders.some((sub) => contains(sub.id));

  for (const project of tree.listFolderContents().folders) {
    if (contains(project.id)) return project.id;
  }

  return null;
}
