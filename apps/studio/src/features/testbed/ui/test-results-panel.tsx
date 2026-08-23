import { CheckCircle2, XCircle, MinusCircle, Clock, Loader2, Bug } from "lucide-react";
import type { ReactNode } from "react";
import type { RunState, TestRow } from "../test-run-model";

const STATUS_ICON: Record<TestRow["status"], ReactNode> = {
  running: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
  passed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  timedout: <Clock className="h-4 w-4 text-amber-500" />,
  skipped: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
  todo: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
  pending: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

/** bigints have no JSON representation, and they are most of what a contract returns. */
function formatValue(value: unknown): string {
  if (typeof value === "bigint") return `${value}n`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? `${v}n` : v)) ?? String(value);
  } catch {
    return String(value);
  }
}

function TestRowView({ row, onRevealLine }: { row: TestRow; onRevealLine?: (line: number) => void }) {
  return (
    <div className="border-b border-border/50 px-3 py-2 text-sm">
      <div className="flex items-center gap-2">
        {STATUS_ICON[row.status]}
        {row.line !== undefined && onRevealLine ? (
          <button
            type="button"
            onClick={() => onRevealLine(row.line!)}
            className="truncate text-left hover:underline"
            title={`Go to line ${row.line}`}
          >
            {row.path.length ? row.path.join(" › ") : row.name}
          </button>
        ) : (
          <span className="truncate">{row.path.length ? row.path.join(" › ") : row.name}</span>
        )}
        {row.durationMs !== undefined && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">{row.durationMs}ms</span>
        )}
      </div>

      {row.failure && (
        <div className="mt-2 rounded bg-red-500/10 p-2 font-mono text-xs">
          <div
            className={
              row.failure.line !== undefined && onRevealLine
                ? "cursor-pointer text-red-400 hover:underline"
                : "text-red-400"
            }
            onClick={() => row.failure?.line !== undefined && onRevealLine?.(row.failure.line)}
          >
            {row.failure.message}
          </div>
          {row.failure.expected !== undefined && (
            <div className="mt-1 text-muted-foreground">
              <div>expected: {formatValue(row.failure.expected)}</div>
              <div>received: {formatValue(row.failure.actual)}</div>
            </div>
          )}
        </div>
      )}

      {row.logs.length > 0 && (
        <div className="mt-2 rounded bg-muted/50 p-2 font-mono text-xs text-muted-foreground">
          {row.logs.map((line, i) => (
            <div key={i}>
              <span className="opacity-60">{line.level}</span> {line.text}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function TestResultsPanel({
  state,
  onRevealLine,
  onDebug,
}: {
  state: RunState;
  onRevealLine?: (line: number) => void;
  onDebug?: () => void;
}) {
  const { counts } = state;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs">
        <span className="text-green-500">{counts.passed} passed</span>
        <span className="text-red-500">{counts.failed} failed</span>
        {counts.skipped > 0 && <span className="text-muted-foreground">{counts.skipped} skipped</span>}
        {counts.timedout > 0 && <span className="text-amber-500">{counts.timedout} timed out</span>}
        <div className="ml-auto flex items-center gap-3">
          {state.durationMs !== undefined && (
            <span className="text-muted-foreground">{state.durationMs}ms</span>
          )}
          {/* The owner decides whether this run is debuggable; a recording without a
              contract source is not, so it passes no callback rather than a dead button. */}
          {onDebug && (
            <button type="button" onClick={onDebug} className="flex items-center gap-1 hover:underline">
              <Bug className="h-3.5 w-3.5" /> Debug
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {state.status === "idle" && (
          <p className="p-4 text-sm text-muted-foreground">Press Run to execute this test file.</p>
        )}

        {state.collectErrors.map((error, i) => (
          <div key={i} className="border-b border-border/50 bg-red-500/10 px-3 py-2 text-sm">
            <div className="font-medium text-red-400">Could not load {error.file}</div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{error.message}</div>
          </div>
        ))}

        {state.hookErrors.map((error, i) => (
          <div key={i} className="border-b border-border/50 bg-amber-500/10 px-3 py-2 text-sm">
            <div className="font-medium text-amber-400">
              {error.phase} failed{error.suite.length ? ` in ${error.suite.join(" › ")}` : ""}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">{error.message}</div>
          </div>
        ))}

        {state.rows.map((row) => (
          <TestRowView key={row.id} row={row} onRevealLine={onRevealLine} />
        ))}

        {state.logs.length > 0 && (
          <div className="px-3 py-2 font-mono text-xs text-muted-foreground">
            {state.logs.map((line, i) => (
              <div key={i}>
                <span className="opacity-60">{line.level}</span> {line.text}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
