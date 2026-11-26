import type { SlotLabel } from "@/features/inspector/model/label-map";
import { analysisClient, type GasResult, type LintResult } from "@/features/analysis/worker/analysis-client";
import { AssistantFailure } from "./errors";

/** The slice of the analysis client the adapters use, so tests can fake it. */
export interface AnalysisClientLike {
  lint(key: string, source: string, params: SlotLabel[]): Promise<LintResult | null>;
  gas(key: string, source: string, loopCap: number | undefined): Promise<GasResult | null>;
}

/*
 * The client answers `null` when a job was superseded or the worker failed. The
 * assistant gets a unique key per call, so supersession cannot come from other
 * agent calls, only from a worker restart racing the request: one retry covers
 * that, a second `null` is a real fault the agent cannot fix.
 */
export function createAssistantAnalysis(client: AnalysisClientLike) {
  let next = 0;

  async function run<T>(what: string, attempt: (key: string) => Promise<T | null>): Promise<T> {
    for (let tries = 0; tries < 2; tries++) {
      const result = await attempt(`assistant:${next++}`);
      if (result !== null) return result;
    }
    throw new AssistantFailure("internal", `The ${what} analysis did not complete.`);
  }

  return {
    lint: (source: string, params: SlotLabel[]) => run("lint", (key) => client.lint(key, source, params)),
    gas: (source: string, loopCap: number | undefined) => run("gas", (key) => client.gas(key, source, loopCap)),
  };
}

/*
 * One instance for the whole app so the key counter never repeats; created on
 * first use because the singleton client opens its Worker lazily.
 */
let shared: ReturnType<typeof createAssistantAnalysis> | null = null;
const analysis = () => (shared ??= createAssistantAnalysis(analysisClient()));

export const assistantLint = (source: string, params: SlotLabel[]) => analysis().lint(source, params);
export const assistantGas = (source: string, loopCap: number | undefined) => analysis().gas(source, loopCap);
