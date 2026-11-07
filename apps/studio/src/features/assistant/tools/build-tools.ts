import type { ToolArgs } from "@smartc-studio/assistant-protocol";
import { SmartC } from "smartc-signum-compiler";
import type { GasRow } from "@/features/analysis/gas/analyzer";
import type { LintFinding } from "@/features/analysis/lint/types";
import type { GasResult, LintResult } from "@/features/analysis/worker/analysis-client";
import { deployParamsFor } from "@/features/deployment/deploy-params";
import type { SlotLabel } from "@/features/inspector/model/label-map";
import type { IndexedLabelMap } from "@/features/inspector/model/resolve-label-map";
import { parseCompileError } from "@/features/smartc-editor/language/compiler-symbols";
import { AssistantFailure } from "./errors";
import { truncate } from "./format";
import { resolveWorkspacePath, type WorkspaceFs } from "./paths";

/*
 * The heavy analyses are injected: in the app they run in the analysis Worker (gas
 * takes over a second on a real contract), in tests they are plain synchronous calls.
 */
export interface BuildDeps {
  loadLabelMaps: () => Promise<IndexedLabelMap[]>;
  lint: (source: string, params: SlotLabel[]) => Promise<LintResult>;
  gas: (source: string, loopCap: number | undefined) => Promise<GasResult>;
}

export interface CompileError {
  line: number;
  col: number;
  message: string;
}

export type CompileResult =
  | {
      ok: true;
      stats: {
        codePages: number;
        dataPages: number;
        userStackPages: number;
        codeStackPages: number;
        minimumFeePlanck: string;
        activationAmountPlanck: string;
      };
      warnings: string[];
      assembly?: string;
      assemblyTruncated?: boolean;
    }
  | { ok: false; errors: CompileError[] };

export interface GasRowSummary {
  minSteps: number;
  maxSteps: number;
  oneRunSteps: number | null;
  maxSigna: number;
  capHit: boolean;
  flags: string[];
}

export type GasToolResult =
  | {
      ok: true;
      methods: (GasRowSummary & { code: number | null; handler: string | null })[];
      handlers: (GasRowSummary & { name: string | null })[];
      postLoop: GasRowSummary | null;
      worstCaseSigna: string;
      worstCaseComplete: boolean;
      activationAmountSigna: string;
      activationTooLow: boolean;
      loopCap: number;
      recursionDetected: boolean;
    }
  | { ok: false; errors: CompileError[] };

const MAX_ASSEMBLY_CHARS = 200_000;
const PLANCK_PER_SIGNA = 100_000_000n;

/** Planck as a decimal Signa string: up to 8 decimals, trailing zeros stripped, no float rounding. */
export function planckToSigna(planck: bigint): string {
  const whole = planck / PLANCK_PER_SIGNA;
  const fraction = (planck % PLANCK_PER_SIGNA).toString().padStart(8, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : `${whole}`;
}

const asCompileError = (e: { line: number; column: number; message: string }): CompileError => ({
  line: e.line,
  col: e.column,
  message: e.message,
});

function summarize(row: GasRow): GasRowSummary {
  const flags: string[] = [];
  if (row.suspend) flags.push("suspend");
  if (row.variableApi) flags.push("variableApi");
  return {
    minSteps: row.minSteps,
    maxSteps: row.maxSteps,
    oneRunSteps: row.oneRunSteps ?? null,
    maxSigna: row.maxSigna,
    capHit: row.capHit,
    flags,
  };
}

export function createBuildTools(fs: WorkspaceFs, deps: BuildDeps) {
  /*
   * Only contracts build. Everything else is refused up front so the agent
   * learns the rule from the error instead of from a confusing compiler message.
   */
  async function contractAt(path: string) {
    const { projectId, name, fileId } = resolveWorkspacePath(fs, path, "read");
    if (!name.toLowerCase().endsWith(".smart.c")) {
      throw new AssistantFailure("path_not_allowed", `"${name}" is not a SmartC contract.`, "Only .smart.c files can be built.");
    }
    if (!fileId) throw new AssistantFailure("file_not_found", `No file at ${path}.`);
    const { content } = await fs.loadFile<unknown>(fileId);
    if (typeof content !== "string") {
      throw new AssistantFailure("path_not_allowed", `${path} does not hold source text.`);
    }
    return { projectId, fileId, source: content };
  }

  return {
    async compile(args: ToolArgs<"compile">): Promise<{ result: CompileResult }> {
      const { projectId, fileId, source } = await contractAt(args.path);

      let result: CompileResult;
      try {
        const compiler = new SmartC({ language: "C", sourceCode: source });
        compiler.compile();
        const mc = compiler.getMachineCode();
        result = {
          ok: true,
          stats: {
            codePages: mc.CodePages,
            dataPages: mc.DataPages,
            userStackPages: mc.UserStackPages,
            codeStackPages: mc.CodeStackPages,
            minimumFeePlanck: String(mc.MinimumFeeNQT),
            activationAmountPlanck: String(mc.PActivationAmount),
          },
          warnings: (mc.Warnings ?? "")
            .split("\n")
            .map((l: string) => l.trim())
            .filter((l: string) => l !== ""),
        };
        if (args.assembly) {
          const asm = truncate(mc.AssemblyCode ?? "", MAX_ASSEMBLY_CHARS);
          result.assembly = asm.text;
          result.assemblyTruncated = asm.truncated;
        }
      } catch (e: any) {
        result = { ok: false, errors: [asCompileError(parseCompileError(e?.message ?? ""))] };
      }

      /*
       * Same record the editor writes on save: the verdict belongs to the version
       * on disk, which is what the tool just compiled, so the project status
       * badges stay truthful.
       */
      const saved = fs.getFileMetadata(fileId);
      if (saved) {
        fs.status.recordCompile(projectId, { sourceModified: saved.lastModified, errorCount: result.ok ? 0 : 1 });
      }
      return { result };
    },

    async analyze_gas(args: ToolArgs<"analyze_gas">): Promise<{ result: GasToolResult }> {
      const { source } = await contractAt(args.path);
      const report = await deps.gas(source, args.loopCap);
      if (!report.ok) return { result: { ok: false, errors: [asCompileError(report.error)] } };

      const { analysis } = report;
      return {
        result: {
          ok: true,
          methods: analysis.methods.map((m) => ({ code: m.code, handler: m.handler, ...summarize(m) })),
          handlers: analysis.handlers.map((h) => ({ name: h.name ?? null, ...summarize(h) })),
          postLoop: analysis.postLoop ? summarize(analysis.postLoop) : null,
          worstCaseSigna: planckToSigna(report.worstCasePlanck),
          worstCaseComplete: report.worstCaseComplete,
          activationAmountSigna: planckToSigna(report.activationAmountPlanck),
          activationTooLow: report.activationTooLow,
          loopCap: analysis.loopCap,
          recursionDetected: analysis.recursionDetected,
        },
      };
    },

    async lint(args: ToolArgs<"lint">): Promise<{ result: { compiled: boolean; findings: LintFinding[] } }> {
      const { source } = await contractAt(args.path);
      // Same parameters the editor's lint sees, so the agent and the user get the same findings.
      const params = deployParamsFor(source, await deps.loadLabelMaps());
      const { compiled, findings } = await deps.lint(source, params);
      return { result: { compiled, findings } };
    },
  };
}

export type BuildTools = ReturnType<typeof createBuildTools>;
