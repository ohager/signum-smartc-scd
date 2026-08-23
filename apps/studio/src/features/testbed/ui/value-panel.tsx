import { useCallback, useEffect, useRef } from "react";
import { useAtomValue } from "jotai";
import Editor, { type OnMount } from "@monaco-editor/react";
import type * as Monaco from "monaco-editor";
import { useTheme } from "next-themes";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react";
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
  const editorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);

  // Computed before the early return below, so the fold effect can depend on it
  // without a conditional hook.
  const sourceText =
    inspected?.trace.detail !== undefined ? toSourceText(inspected.trace.detail) : "";

  const onMount: OnMount = (editor) => {
    // @ts-ignore — @monaco-editor/react resolves its own nested monaco-editor
    // version, which structurally diverges from the root one; see the same
    // workaround in debug-view.tsx's onMount.
    editorRef.current = editor;
  };

  // Buttons rather than only gutter chevrons: folding a value is the main
  // reason to open this tab, and it should not depend on finding a control
  // that is only a few pixels wide.
  const fold = useCallback((action: "editor.foldAll" | "editor.unfoldAll") => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    editor.trigger("value-panel", action, null);
  }, []);

  /**
   * Opens on the shape of the value rather than all of it: the top level stays
   * expanded and everything nested inside it starts folded.
   *
   * Deferred a tick because the folding ranges are computed from the model
   * after it is set, so triggering during the same turn finds nothing to fold.
   */
  useEffect(() => {
    if (!sourceText) return;
    const timer = setTimeout(() => {
      editorRef.current?.trigger("value-panel", "editor.foldLevel2", null);
    }, 0);
    return () => clearTimeout(timer);
  }, [sourceText]);

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
      <div className="flex shrink-0 items-start gap-2 border-b border-border px-3 py-2">
        <div className="min-w-0 flex-1">
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

        {trace.detail !== undefined && trace.detail.kind !== "leaf" && (
          <div className="flex shrink-0 gap-1">
            <button
              type="button"
              onClick={() => fold("editor.foldAll")}
              title="Collapse all"
              aria-label="Collapse all"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronsDownUp className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => fold("editor.unfoldAll")}
              title="Expand all"
              aria-label="Expand all"
              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <ChevronsUpDown className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1">
        {trace.detail !== undefined ? (
          <Editor
            height="100%"
            // JavaScript, not JSON: captured values are full of bigints, and
            // `200000000n` is a literal here rather than a quoted lie.
            language="javascript"
            theme={theme === "dark" ? "vs-dark" : "light"}
            value={sourceText}
            onMount={onMount}
            options={{
              readOnly: true,
              domReadOnly: true,
              minimap: { enabled: false },
              fontSize: 12,
              // Line numbers stay on because the folding controls live in the
              // same gutter: with them off it collapses to a few pixels and the
              // chevrons have nowhere to render.
              lineNumbers: "on",
              folding: true,
              // Always visible rather than the default "mouseover", which hides
              // the one control this panel exists for until you find it.
              showFoldingControls: "always",
              // Indentation-based folding needs no language service. The text is
              // emitted with consistent two-space indents by `toSourceText`, so
              // the ranges are exactly the object and array bodies.
              foldingStrategy: "indentation",
              wordWrap: "on",
              renderLineHighlight: "none",
              overviewRulerLanes: 0,
              scrollBeyondLastLine: false,
              automaticLayout: true,
              // Left on: it carries Fold All and Unfold All.
              contextmenu: true,
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
