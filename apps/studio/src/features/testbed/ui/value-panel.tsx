import { useAtomValue } from "jotai";
import Editor from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { inspectedValueAtom } from "../test-trace-store";
import { toSourceText } from "../value-node";

/**
 * The full value behind an inline annotation, in a read-only editor.
 *
 * A real editor rather than a bespoke tree widget: it brings folding, find,
 * selection and copy for free, and a captured contract value is often large
 * enough that searching it matters more than clicking through it.
 *
 * This replaces the decoration hover, which could never be made reliable — the
 * annotation is injected text sitting outside its decoration's zero-width
 * range, so Monaco frequently had nothing to hover-test against.
 */
export function ValuePanel() {
  const inspected = useAtomValue(inspectedValueAtom);
  const { theme } = useTheme();

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

      <div className="min-h-0 flex-1">
        {trace.detail !== undefined ? (
          <Editor
            height="100%"
            // JavaScript, not JSON: captured values are full of bigints, and
            // `200000000n` is a literal here rather than a quoted lie.
            language="javascript"
            theme={theme === "dark" ? "vs-dark" : "light"}
            value={toSourceText(trace.detail)}
            options={{
              readOnly: true,
              domReadOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              lineNumbers: "off",
              folding: true,
              wordWrap: "on",
              renderLineHighlight: "none",
              overviewRulerLanes: 0,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              contextmenu: false,
            }}
          />
        ) : (
          <p className="p-4 text-sm text-muted-foreground">
            This line completed an assertion but bound no value.
          </p>
        )}
      </div>

      {trace.count > 1 && (
        <div className="max-h-40 shrink-0 overflow-auto border-t border-border px-3 py-2">
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
  );
}
