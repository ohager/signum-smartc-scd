/**
 * Aggregate stats for a project (a root folder) shown on the home page.
 *
 * `listFolderContents` is synchronous and only one level deep, so counting
 * files and finding the "main" contract needs a recursive walk. Same pure
 * structural-interface approach as `features/project/tree-reveal.ts`, so this
 * is testable against an in-memory fake.
 */

/** The slice of the file system the walk needs. */
export interface SummaryFs {
  getFolder(folderId: string): { name: string; lastModified: number };
  listFolderContents(folderId?: string): {
    folders: { id: string }[];
    files: { id: string; metadata: { name: string; lastModified: number } }[];
  };
}

export interface ProjectSummary {
  id: string;
  name: string;
  /** Files in the whole subtree, not just the top level. */
  fileCount: number;
  /** Newest file timestamp in the subtree; the folder's own when it has no files. */
  lastModified: number;
  /** File the project card opens, or `null` when the project has no files. */
  mainFileId: string | null;
}

const SMARTC_EXTENSION = ".smart.c";

interface Candidate {
  id: string;
  name: string;
  lastModified: number;
}

interface WalkResult {
  fileCount: number;
  lastModified: number;
  candidates: Candidate[];
}

function walk(fs: SummaryFs, folderId: string): WalkResult {
  const { folders, files } = fs.listFolderContents(folderId);

  const candidates: Candidate[] = files.map((file) => ({
    id: file.id,
    name: file.metadata.name,
    lastModified: file.metadata.lastModified,
  }));

  let fileCount = candidates.length;
  let lastModified = 0;
  for (const candidate of candidates) {
    if (candidate.lastModified > lastModified) lastModified = candidate.lastModified;
  }

  for (const sub of folders) {
    const result = walk(fs, sub.id);
    fileCount += result.fileCount;
    if (result.lastModified > lastModified) lastModified = result.lastModified;
    candidates.push(...result.candidates);
  }

  return { fileCount, lastModified, candidates };
}

function newestId(candidates: readonly Candidate[]): string | null {
  let best: Candidate | null = null;
  for (const candidate of candidates) {
    if (!best || candidate.lastModified > best.lastModified) best = candidate;
  }
  return best ? best.id : null;
}

/**
 * The main file is the most recently modified contract, falling back to the
 * most recently modified file of any type.
 *
 * Matched on the `.smart.c` file-name suffix rather than the stored `type`
 * field on purpose: the suffix is what `acceptedFileType` treats as canonical,
 * and importing `FileTypes` from `filetype-icons.tsx` would pull `lucide-react`
 * into this module and its tests.
 */
function pickMainFile(candidates: readonly Candidate[]): string | null {
  const contracts = candidates.filter((candidate) =>
    candidate.name.toLowerCase().endsWith(SMARTC_EXTENSION),
  );
  return newestId(contracts) ?? newestId(candidates);
}

export function summarizeProject(fs: SummaryFs, folderId: string): ProjectSummary {
  const folder = fs.getFolder(folderId);
  const { fileCount, lastModified, candidates } = walk(fs, folderId);
  return {
    id: folderId,
    name: folder.name,
    fileCount,
    lastModified: fileCount > 0 ? lastModified : folder.lastModified,
    mainFileId: pickMainFile(candidates),
  };
}

/** Every root project, most recent activity first. */
export function summarizeProjects(fs: SummaryFs): ProjectSummary[] {
  return fs
    .listFolderContents()
    .folders.map((folder) => summarizeProject(fs, folder.id))
    .sort((a, b) => b.lastModified - a.lastModified);
}
