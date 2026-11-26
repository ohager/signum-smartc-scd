import type { ToolArgs } from "@smartc-studio/assistant-protocol";
import { contractOfProject } from "@/features/project/contract";
import { acceptedFileType, FileTypes } from "@/features/project/filetype-icons";
import { uniqueName } from "@/features/project/file-naming";
import { smartcStarter } from "@/features/project/smartc-starter";
import { isTestEntry } from "@/features/testbed/project-snapshot";
import { replaceWhitespace } from "@/lib/string";
import { AssistantFailure } from "./errors";
import { MAX_READ_LINES, numberLines } from "./format";
import { resolveProject, resolveWorkspacePath, type WorkspaceFs } from "./paths";

export interface Touched {
  fileId: string;
  projectId: string;
}

/*
 * One shape for every workspace tool, reads included, so the registry never
 * special-cases. `touched` is internal: it drives follow mode and round start, and
 * is stripped before the agent sees `result`. `create_project` lists the contract
 * first because the registry starts its round from `touched[0].projectId`.
 */
export interface ToolOutput<R> {
  result: R;
  touched?: Touched[];
}

export interface ProjectSummary {
  name: string;
  path: string;
  contract: string | null;
  testFiles: string[];
  compile: "ok" | "error" | "stale" | "unknown";
  tests: { passed: number; failed: number } | null;
}

function textOf(content: unknown): string {
  return typeof content === "string" ? content : JSON.stringify(content, null, 2);
}

function lineCount(text: string): number {
  if (text === "") return 0;
  const n = text.split("\n").length;
  return text.endsWith("\n") ? n - 1 : n;
}

function fileTypeFor(name: string): string {
  if (name.toLowerCase().endsWith(".md")) return FileTypes.Doc;
  return acceptedFileType(name) ?? FileTypes.Doc;
}

function notFound(path: string): never {
  throw new AssistantFailure("file_not_found", `No file at ${path}.`);
}

export function createWorkspaceTools(fs: WorkspaceFs) {
  return {
    async list_projects(_args: ToolArgs<"list_projects">): Promise<ToolOutput<{ projects: ProjectSummary[] }>> {
      const projects = fs.listFolderContents(fs.rootFolderId).folders.map(({ id, metadata }): ProjectSummary => {
        const files = fs.listFilesRecursive(id);
        const contract = contractOfProject(files)?.contract ?? null;
        const record = fs.status.of(id);

        // Same freshness rule as useCompileVerdict: a verdict belongs to one version of the source.
        let compile: ProjectSummary["compile"] = "unknown";
        if (contract && record.compile) {
          compile =
            record.compile.sourceModified !== contract.lastModified
              ? "stale"
              : record.compile.errorCount === 0
                ? "ok"
                : "error";
        }

        const testFiles = files.filter((f) => isTestEntry(f.path));
        let passed = 0;
        let failed = 0;
        let anyFresh = false;
        for (const test of testFiles) {
          const v = record.tests[test.id];
          if (!v || !contract) continue;
          if (v.sourceModified !== test.lastModified || v.contractModified !== contract.lastModified) continue;
          anyFresh = true;
          passed += v.passed;
          failed += v.failed;
        }

        return {
          name: metadata.name,
          path: `/${metadata.name}`,
          contract: contract?.path ?? null,
          testFiles: testFiles.map((f) => f.path),
          compile,
          tests: anyFresh ? { passed, failed } : null,
        };
      });
      return { result: { projects } };
    },

    async list_files(
      args: ToolArgs<"list_files">,
    ): Promise<ToolOutput<{ project: string; files: { path: string; type: string; lastModified: number }[] }>> {
      const projectId = resolveProject(fs, args.project);
      const files = fs
        .listFilesRecursive(projectId)
        .map((f) => ({ path: f.path, type: f.type, lastModified: f.lastModified }));
      return { result: { project: args.project, files } };
    },

    async read_file(args: ToolArgs<"read_file">): Promise<
      ToolOutput<{ path: string; totalLines: number; from: number; to: number; truncated: boolean; text: string }>
    > {
      const { fileId } = resolveWorkspacePath(fs, args.path, "read");
      if (!fileId) notFound(args.path);

      const text = textOf((await fs.loadFile<unknown>(fileId)).content);
      const totalLines = lineCount(text);
      const from = args.from ?? 1;
      let to = Math.min(args.to ?? totalLines, totalLines);
      let truncated = false;
      if (to - from + 1 > MAX_READ_LINES) {
        to = from + MAX_READ_LINES - 1;
        truncated = true;
      }
      if (from > totalLines) {
        return { result: { path: args.path, totalLines, from, to: totalLines, truncated: false, text: "" } };
      }
      return { result: { path: args.path, totalLines, from, to, truncated, text: numberLines(text, from, to) } };
    },

    async write_file(
      args: ToolArgs<"write_file">,
    ): Promise<ToolOutput<{ path: string; created: boolean; lines: number }>> {
      const { projectId, folderId, name, fileId } = resolveWorkspacePath(fs, args.path, "write");
      let id = fileId;
      if (id) await fs.saveFile(id, args.content);
      else id = await fs.addFile(folderId, name, fileTypeFor(name), args.content);
      return {
        result: { path: args.path, created: fileId === null, lines: lineCount(args.content) },
        touched: [{ fileId: id, projectId }],
      };
    },

    async edit_file(args: ToolArgs<"edit_file">): Promise<ToolOutput<{ path: string; line: number }>> {
      const { projectId, fileId } = resolveWorkspacePath(fs, args.path, "write");
      if (!fileId) notFound(args.path);

      const { content } = await fs.loadFile<unknown>(fileId);
      if (typeof content !== "string") {
        // Replacing inside a serialised object would store a string where the Studio expects an object.
        throw new AssistantFailure(
          "edit_no_match",
          `${args.path} does not hold text and cannot be edited.`,
          "This file is not plain text; read it and use write_file to replace it.",
        );
      }

      const first = content.indexOf(args.old);
      if (first === -1) {
        throw new AssistantFailure("edit_no_match", `The text to replace was not found in ${args.path}.`);
      }
      let count = 0;
      for (let i = first; i !== -1; i = content.indexOf(args.old, i + args.old.length)) count++;
      if (count > 1) {
        throw new AssistantFailure("edit_ambiguous", `The text to replace occurs ${count} times in ${args.path}.`);
      }

      // Slice instead of String.replace so "$&" and friends in `new` stay literal.
      const next = content.slice(0, first) + args.new + content.slice(first + args.old.length);
      await fs.saveFile(fileId, next);
      const line = content.slice(0, first).split("\n").length;
      return { result: { path: args.path, line }, touched: [{ fileId, projectId }] };
    },

    async delete_file(args: ToolArgs<"delete_file">): Promise<ToolOutput<{ path: string; deleted: true }>> {
      const { projectId, fileId } = resolveWorkspacePath(fs, args.path, "write");
      if (!fileId) notFound(args.path);
      await fs.deleteFile(fileId);
      return { result: { path: args.path, deleted: true }, touched: [{ fileId, projectId }] };
    },

    async create_project(
      args: ToolArgs<"create_project">,
    ): Promise<ToolOutput<{ project: string; path: string; files: string[] }>> {
      if (/[/\\]/.test(args.name) || args.name === "." || args.name === "..") {
        throw new AssistantFailure(
          "path_not_allowed",
          `"${args.name}" cannot be a project name.`,
          "Use a plain name without slashes, like my-contract.",
        );
      }
      // Mirrors NewProjectDialog: the folder keeps the typed name, the contract gets the slug.
      const taken = fs.listFolderContents(fs.rootFolderId).folders.map((f) => f.metadata.name);
      const project = uniqueName(args.name, taken);
      const projectId = await fs.createFolder(fs.rootFolderId, project);
      const base = replaceWhitespace(args.name).toLowerCase();
      const fileName = `${base}.smart.c`;
      const fileId = await fs.addFile(projectId, fileName, FileTypes.SmartC, smartcStarter(base));
      return {
        result: { project, path: `/${project}`, files: [`/${project}/${fileName}`] },
        touched: [{ fileId, projectId }],
      };
    },
  };
}

export type WorkspaceTools = ReturnType<typeof createWorkspaceTools>;
