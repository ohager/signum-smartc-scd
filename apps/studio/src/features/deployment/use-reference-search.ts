import { useEffect, useState } from "react";
import { findReferences, type ReferenceCandidate, type ReferenceLedger } from "./reference-search";

export interface ReferenceSearch {
  state: "idle" | "searching" | "done" | "failed";
  candidates: ReferenceCandidate[];
  error?: string;
  retry: () => void;
}

interface Result {
  codeHash: string | null;
  state: ReferenceSearch["state"];
  candidates: ReferenceCandidate[];
  error?: string;
}

/**
 * Originals for the code being deployed, on the node XT Wallet talks to.
 *
 * A result is tied to the hash it was found for: after an edit, the old
 * candidates would reference other code, so they disappear in the same
 * render the hash changes, not one effect later.
 */
export function useReferenceSearch(codeHash: string | null, ledger: ReferenceLedger | null): ReferenceSearch {
  const [result, setResult] = useState<Result>({ codeHash: null, state: "idle", candidates: [] });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!codeHash || !ledger) {
      setResult({ codeHash, state: "idle", candidates: [] });
      return;
    }
    const controller = new AbortController();
    setResult({ codeHash, state: "searching", candidates: [] });
    findReferences(ledger, codeHash, controller.signal).then(
      (candidates) => !controller.signal.aborted && setResult({ codeHash, state: "done", candidates }),
      (e: unknown) =>
        !controller.signal.aborted &&
        setResult({ codeHash, state: "failed", candidates: [], error: (e as Error)?.message ?? String(e) }),
    );
    return () => controller.abort();
  }, [codeHash, ledger, attempt]);

  const retry = () => setAttempt((n) => n + 1);
  if (result.codeHash !== codeHash) {
    return { state: codeHash && ledger ? "searching" : "idle", candidates: [], retry };
  }
  return { state: result.state, candidates: result.candidates, error: result.error, retry };
}
