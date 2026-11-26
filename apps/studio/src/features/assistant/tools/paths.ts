import type { FileSystem } from "@/lib/file-system/file-system";
import { AssistantFailure } from "./errors";

export type WorkspaceFs = Pick<
  FileSystem,
  | "rootFolderId"
  | "listFolderContents"
  | "listFilesRecursive"
  | "getFileIdByPath"
  | "getFileMetadata"
  | "loadFile"
  | "saveFile"
  | "addFile"
  | "deleteFile"
  | "createFolder"
  | "getFolder"
  | "status"
>;

export interface ResolvedPath {
  projectId: string;
  folderId: string;
  name: string;
  fileId: string | null;
}

/*
 * `.asm` is deliberately absent: it is generated output the agent may read but
 * never write. Matched case-insensitively, like the Studio's own type detection.
 */
const WRITABLE_SUFFIXES = [".smart.c", ".test.ts", ".ts", ".scenario.json", ".labels.json", ".inspect.json", ".md"];

export function isWritableName(name: string): boolean {
  const lower = name.toLowerCase();
  return WRITABLE_SUFFIXES.some((suffix) => lower.endsWith(suffix));
}

function rejected(message: string, hint?: string): never {
  throw new AssistantFailure("path_not_allowed", message, hint);
}

/** The project folder named `name`; unknown or ambiguous names are refused. */
export function resolveProject(fs: WorkspaceFs, name: string): string {
  const matches = fs.listFolderContents(fs.rootFolderId).folders.filter((f) => f.metadata.name === name);
  if (matches.length === 0) rejected(`No project named "${name}".`);
  if (matches.length > 1) {
    rejected(
      `Two projects are named "${name}".`,
      "Ask the user to rename one of the projects in the Studio, then retry.",
    );
  }
  return matches[0]!.id;
}

/*
 * Every path rule lives here so no tool can forget one. Strict syntax first (no
 * `..`, no empty segments, no backslashes) because the path is the security
 * boundary, then the workspace lookups.
 */
export function resolveWorkspacePath(fs: WorkspaceFs, path: string, mode: "read" | "write"): ResolvedPath {
  if (!path.startsWith("/")) rejected(`Path "${path}" is not absolute.`);
  if (path.includes("\\")) rejected(`Path "${path}" contains a backslash.`);

  const segments = path.slice(1).split("/");
  if (segments.some((s) => s === "")) rejected(`Path "${path}" has an empty segment or a trailing slash.`);
  if (segments.some((s) => s === "." || s === "..")) rejected(`Path "${path}" contains "." or "..".`);
  if (segments.length < 2) rejected(`Path "${path}" names a project, not a file.`);

  const projectId = resolveProject(fs, segments[0]!);
  const name = segments[segments.length - 1]!;

  let folderId = projectId;
  for (const segment of segments.slice(1, -1)) {
    const next = fs.listFolderContents(folderId).folders.find((f) => f.metadata.name === segment);
    if (!next) {
      // Reading a path under a folder that is not there is a plain miss; only writing is a policy refusal.
      if (mode === "read") {
        throw new AssistantFailure(
          "file_not_found",
          `Folder "${segment}" does not exist in "${path}".`,
          "Check the path with list_files.",
        );
      }
      rejected(
        `Folder "${segment}" does not exist in "${path}".`,
        "Folders cannot be created by the assistant. Write into an existing folder (see list_files) or the project root.",
      );
    }
    folderId = next.id;
  }

  if (mode === "write" && !isWritableName(name)) {
    rejected(
      `"${name}" is not a writable file type.`,
      "Writable files end in .smart.c, .test.ts, .ts, .scenario.json, .labels.json, .inspect.json or .md.",
    );
  }

  const file = fs.listFolderContents(folderId).files.find((f) => f.metadata.name === name);
  return { projectId, folderId, name, fileId: file?.id ?? null };
}
