import { z } from "zod";

/*
 * The single source of truth for what an AI agent may do in the Studio. The relay
 * advertises exactly these tools and the Studio validates every call against the same
 * schemas, so a drifting copy on either side is impossible. There is deliberately no
 * wallet, account, network or deploy tool: the agent works on code, never on funds.
 */

const path = z.string().startsWith("/");

const schemas = {
  list_projects: z.object({}).strict(),
  list_files: z.object({ project: z.string().min(1) }).strict(),
  read_file: z.object({ path, from: z.number().int().min(1).optional(), to: z.number().int().min(1).optional() }).strict(),
  write_file: z.object({ path, content: z.string().max(1_000_000) }).strict(),
  edit_file: z.object({ path, old: z.string().min(1), new: z.string() }).strict(),
  delete_file: z.object({ path }).strict(),
  create_project: z.object({ name: z.string().min(1).max(64) }).strict(),
  get_editor_context: z.object({}).strict(),
  open_file: z.object({ path, line: z.number().int().min(1).optional() }).strict(),
  compile: z.object({ path, assembly: z.boolean().optional() }).strict(),
  analyze_gas: z.object({ path, loopCap: z.number().int().min(1).max(1000).optional() }).strict(),
  lint: z.object({ path }).strict(),
  run_tests: z.object({ project: z.string().min(1), file: path.optional(), test: z.array(z.string()).min(1).optional() }).strict(),
};

export type ToolName = keyof typeof schemas;
export type ToolArgs<N extends ToolName> = z.infer<(typeof schemas)[N]>;
export type ToolKind = "global" | "read" | "write";

export interface ToolDef {
  name: ToolName;
  description: string;
  input: z.ZodObject;
  kind: ToolKind;
  timeoutMs: number;
}

const P = "Paths are absolute within the Studio workspace: /<project>/<file>, e.g. /my-contract/contract.smart.c.";

function def<N extends ToolName>(name: N, kind: ToolKind, timeoutMs: number, description: string): ToolDef {
  return { name, kind, timeoutMs, description, input: schemas[name] };
}

export const CATALOG: readonly ToolDef[] = [
  def("list_projects", "global", 10_000, "Lists all Studio projects with their contract file, test files and the latest compile and test verdicts."),
  def("list_files", "read", 10_000, "Lists the file tree of one project. Takes the project name; returns absolute file paths."),
  def("read_file", "read", 10_000, `Reads a file and returns its content with line numbers, optionally limited to the 1-based line range from..to. ${P}`),
  def("write_file", "write", 10_000, `Creates or overwrites a file with the given content. Covered by checkpoints, so the user can undo it. ${P}`),
  def("edit_file", "write", 10_000, `Replaces text in a file. 'old' must match exactly once, otherwise the call fails with edit_no_match or edit_ambiguous. ${P}`),
  def("delete_file", "write", 10_000, `Deletes a file. Covered by checkpoints, so the user can undo it. ${P}`),
  def("create_project", "write", 10_000, "Creates a new project from the SmartC and test starters. Returns the project name and its file paths."),
  def("get_editor_context", "global", 10_000, "Returns the file open in the Studio editor, the cursor, the selection and the current diagnostics."),
  def("open_file", "read", 10_000, `Shows a file, optionally at a 1-based line, to the user in the Studio editor. ${P}`),
  def("compile", "read", 30_000, `Compiles a SmartC file. Returns ok or errors [{line, col, message}], code and data page stats, and optionally the assembly. ${P}`),
  def("analyze_gas", "read", 30_000, `Analyses the gas cost of a SmartC file. Returns min/max steps and Signa per handler, the post-loop cost, flags and the comparison with activationAmount. ${P}`),
  def("lint", "read", 30_000, `Lints a SmartC file. Returns findings [{rule, severity, line, message, hint}]. ${P}`),
  def("run_tests", "read", 120_000, "Runs the project's tests in the Studio worker, exactly like the test panel. Returns a summary and failures with expected/actual, source position and truncated console output."),
];

export function toolDef(name: string): ToolDef | undefined {
  return CATALOG.find((t) => t.name === name);
}
