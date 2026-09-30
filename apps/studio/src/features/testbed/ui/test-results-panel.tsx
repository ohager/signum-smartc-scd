import {
  CheckCircle2,
  XCircle,
  MinusCircle,
  Clock,
  Loader2,
} from "lucide-react";
import type { ReactNode } from "react";
import type { RunState, TestRow } from "../test-run-model";
import { serializeValue } from "../serialize-value";
import { t } from "@/i18n/runtime";

const STATUS_ICON: Record<TestRow["status"], ReactNode> = {
  running: <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />,
  passed: <CheckCircle2 className="h-4 w-4 text-green-500" />,
  failed: <XCircle className="h-4 w-4 text-red-500" />,
  timedout: <Clock className="h-4 w-4 text-amber-500" />,
  skipped: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
  todo: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
  pending: <MinusCircle className="h-4 w-4 text-muted-foreground" />,
};

function TestRowView({
  row,
  onRevealLine,
  onSelectTest,
  isActive,
}: {
  row: TestRow;
  onRevealLine?: (line: number) => void;
  onSelectTest?: (id: string) => void;
  isActive?: boolean;
}) {
  return (
    <div
      className={`border-b border-border/50 px-3 py-2 text-sm${isActive ? " bg-muted/40" : ""}`}
    >
      <div className="flex items-center gap-2">
        {STATUS_ICON[row.status]}
        {row.line !== undefined && onRevealLine ? (
          <button
            type="button"
            onClick={() => {
              onSelectTest?.(row.id);
              onRevealLine(row.line!);
            }}
            className="truncate text-left hover:underline"
            title={t("testbed.results.goToLine", { line: row.line! })}
          >
            {row.path.length ? row.path.join(" › ") : row.name}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => onSelectTest?.(row.id)}
            className="truncate text-left hover:underline"
          >
            {row.path.length ? row.path.join(" › ") : row.name}
          </button>
        )}
        {row.durationMs !== undefined && (
          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
            {t("testbed.results.duration", { ms: row.durationMs })}
          </span>
        )}
      </div>

      {row.failure && (
        <div className="mt-2 rounded bg-[color-mix(in_srgb,var(--mag)_10%,transparent)] p-2 font-mono text-xs">
          <div
            className={
              row.failure.line !== undefined && onRevealLine
                ? "cursor-pointer text-[var(--mag)] hover:underline"
                : "text-[var(--mag)]"
            }
            onClick={() =>
              row.failure?.line !== undefined &&
              onRevealLine?.(row.failure.line)
            }
          >
            {row.failure.message}
          </div>
          {row.failure.expected !== undefined && (
            <div className="mt-1 text-muted-foreground">
              <div>{t("testbed.results.expected", { value: serializeValue(row.failure.expected) })}</div>
              <div>{t("testbed.results.received", { value: serializeValue(row.failure.actual) })}</div>
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
  onSelectTest,
  activeTestId,
}: {
  state: RunState;
  onRevealLine?: (line: number) => void;
  onSelectTest?: (id: string) => void;
  activeTestId?: string | null;
}) {
  const { counts } = state;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-3 py-2 text-xs">
        <span className="text-green-500">{t("testbed.results.passed", { count: counts.passed })}</span>
        <span className="text-red-500">{t("testbed.results.failed", { count: counts.failed })}</span>
        {counts.skipped > 0 && (
          <span className="text-muted-foreground">
            {t("testbed.results.skipped", { count: counts.skipped })}
          </span>
        )}
        {counts.timedout > 0 && (
          <span className="text-amber-500">{t("testbed.results.timedOut", { count: counts.timedout })}</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {state.durationMs !== undefined && (
            <span className="text-muted-foreground">{t("testbed.results.duration", { ms: state.durationMs })}</span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {state.status === "idle" && (
          <p className="p-4 text-sm text-muted-foreground">
            {t("testbed.results.pressRun")}
          </p>
        )}

        {state.collectErrors.map((error, i) => (
          <div
            key={i}
            className="border-b border-border/50 bg-[color-mix(in_srgb,var(--mag)_10%,transparent)] px-3 py-2 text-sm"
          >
            <div className="font-medium text-[var(--mag)]">
              {t("testbed.results.couldNotLoad", { file: error.file })}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {error.message}
            </div>
          </div>
        ))}

        {state.hookErrors.map((error, i) => (
          <div
            key={i}
            className="border-b border-border/50 bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-3 py-2 text-sm"
          >
            <div className="font-medium text-[var(--amber)]">
              {error.suite.length
                ? t("testbed.results.hookFailedIn", { phase: error.phase, suite: error.suite.join(" › ") })
                : t("testbed.results.hookFailed", { phase: error.phase })}
            </div>
            <div className="mt-1 font-mono text-xs text-muted-foreground">
              {error.message}
            </div>
          </div>
        ))}

        {state.rows.map((row) => (
          <TestRowView
            key={row.id}
            row={row}
            onRevealLine={onRevealLine}
            onSelectTest={onSelectTest}
            isActive={row.id === activeTestId}
          />
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
