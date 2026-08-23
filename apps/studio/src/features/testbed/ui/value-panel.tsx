import { useAtomValue } from "jotai";
import { inspectedValueAtom } from "../test-trace-store";
import { ValueTree } from "./value-tree";

/**
 * The full value behind an inline annotation.
 *
 * This replaces the decoration hover, which could never be made reliable: the
 * annotation is injected text sitting outside its decoration's zero-width
 * range, so Monaco frequently had nothing to hover-test against.
 */
export function ValuePanel() {
  const inspected = useAtomValue(inspectedValueAtom);

  if (!inspected) {
    return (
      <p className="p-4 text-sm text-muted-foreground">
        Click a value shown at the end of a line to inspect it here.
      </p>
    );
  }

  const { file, line, trace } = inspected;
  const dropped = trace.count - trace.values.length;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="font-mono text-sm">
          {trace.name ?? "value"}
          {trace.count > 1 && (
            <span className="ml-2 text-xs text-muted-foreground">
              ran {trace.count} times — showing the last
            </span>
          )}
        </div>
        <div className="truncate text-xs text-muted-foreground" title={file}>
          {file}:{line}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {trace.detail !== undefined ? (
          <div className="px-3 py-2 font-mono text-xs">
            <ValueTree node={trace.detail} />
          </div>
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            This line completed an assertion but bound no value.
          </p>
        )}

        {trace.count > 1 && (
          <div className="border-t border-border px-3 py-2">
            <div className="mb-1 text-xs text-muted-foreground">
              {dropped > 0
                ? `Each run, showing the last ${trace.values.length} of ${trace.count}`
                : "Each run"}
            </div>
            <ol className="font-mono text-xs">
              {trace.values.map((value, index) => (
                <li key={index} className="flex gap-2">
                  <span className="shrink-0 text-muted-foreground">{dropped + index + 1}:</span>
                  <span className="break-all">{value}</span>
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
