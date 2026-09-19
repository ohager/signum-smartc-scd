import { useEffect, useRef, useState } from "react";
import { changedKeys } from "./changed-keys";

/**
 * The keys whose value changed on this render, for one render.
 *
 * Callers add the flash class to those rows. The set empties on the next
 * render so the animation plays once rather than sticking.
 */
export function useChangedValues(values: Record<string, string>): Set<string> {
  const previous = useRef<Record<string, string> | undefined>(undefined);
  const [changed, setChanged] = useState<Set<string>>(new Set());

  useEffect(() => {
    const next = changedKeys(previous.current, values);
    previous.current = { ...values };
    if (next.size > 0) setChanged(next);
    else if (changed.size > 0) setChanged(new Set());
    // `changed` is deliberately not a dependency: reading it here only avoids
    // a pointless state write, and depending on it would loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [values]);

  return changed;
}
