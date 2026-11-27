import { useEffect, useReducer } from "react";
import { useAtomValue } from "jotai";
import { agentActiveUntil } from "../activity/feed-model";
import { feedAtom } from "../state";

/*
 * Whether the connected agent is working right now, for the header icon. The feed only
 * changes on agent events, so once it falls quiet a timer re-renders when the activity
 * window runs out; the comparison itself reads the clock at render time.
 */
export function useAgentActive(connected: boolean): boolean {
  const feed = useAtomValue(feedAtom);
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const until = connected ? agentActiveUntil(feed) : null;

  useEffect(() => {
    if (until === null || until === Infinity) return;
    const ms = until - Date.now();
    if (ms <= 0) return;
    // A little slack, so the re-render reliably lands after `until`.
    const handle = setTimeout(rerender, ms + 50);
    return () => clearTimeout(handle);
  }, [until]);

  return until !== null && until > Date.now();
}
