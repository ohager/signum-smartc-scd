import { gasReport } from "../gas/gas-report";
import { lintContract } from "../lint/lint";
import type { SlotLabel } from "@/features/inspector/model/label-map";

/**
 * Worker entry. The gas rule recompiles and walks the assembly for 1 s or
 * more on a real contract, which would freeze typing if it ran in the
 * editor's debounce. Params arrive precomputed because deriving them needs
 * the Label Maps, which live on the main thread.
 */
const scope = self as unknown as {
  onmessage: ((e: { data: { id: number } & (
      | { kind?: "lint"; source: string; params: SlotLabel[] }
      | { kind: "gas"; source: string; loopCap: number | undefined }
    ) }) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = ({ data }) => {
  try {
    const result =
      data.kind === "gas"
        ? gasReport(data.source, { loopCap: data.loopCap })
        : lintContract(data.source, { params: data.params });
    scope.postMessage({ id: data.id, result });
  } catch (e) {
    scope.postMessage({ id: data.id, error: e instanceof Error ? e.message : String(e) });
  }
};
