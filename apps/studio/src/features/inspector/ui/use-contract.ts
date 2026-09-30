import { useCallback, useEffect, useMemo, useState } from "react";
import type { Contract } from "@signumjs/contracts";
import { createInspectorClient, InspectorError, type InspectorClient } from "../chain/inspector-client";
import { networkKey } from "../model/networks";
import type { WatchEntry } from "../model/watchlist";

type State = "idle" | "loading" | "ready" | "error";

/** One contract fetched from its node; refetched on demand, never polled (M1). */
export function useContract(entry: WatchEntry | null) {
  const key = entry ? `${entry.id}@${networkKey(entry.network)}` : "";
  const client: InspectorClient | null = useMemo(
    () => (entry ? createInspectorClient(entry.network) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key],
  );
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState<{ state: State; contract: Contract | null; error: InspectorError | null }>({
    state: "idle", contract: null, error: null,
  });

  useEffect(() => {
    if (!entry || !client) {
      setResult({ state: "idle", contract: null, error: null });
      return;
    }
    let cancelled = false;
    setResult((r) => ({ ...r, state: "loading", error: null }));
    client
      .getContract(entry.id)
      .then((contract) => !cancelled && setResult({ state: "ready", contract, error: null }))
      .catch((e) =>
        !cancelled &&
        setResult({
          state: "error",
          contract: null,
          error: e instanceof InspectorError ? e : new InspectorError("node", String(e)),
        }),
      );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, revision]);

  const refresh = useCallback(() => setRevision((r) => r + 1), []);
  return { ...result, refresh, client, revision };
}
