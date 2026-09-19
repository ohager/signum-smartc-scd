import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The strip above every editor: diagnostics on the left, file actions on the
 * right.
 *
 * Four editors each declared the same class string. They share it now, which
 * is also the only way a change of climate reaches all four at once.
 */
export function EditorToolbar({
  children,
  actions,
  className,
}: {
  children?: ReactNode;
  actions: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-[30px] w-full shrink-0 items-center justify-between border-b border-[var(--border-1)] bg-[var(--bg2)] px-2",
        className,
      )}
    >
      <div className="flex min-w-0 items-center gap-2 text-xs">{children}</div>
      {actions}
    </section>
  );
}

/**
 * A diagnostic in the strip. Colour never carries the state on its own — the
 * glyph says which it is even where the two hues are close, as they are in
 * Solaris.
 */
export function EditorDiagnostic({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className="flex items-center gap-1 truncate"
      style={{ color: tone === "error" ? "var(--mag)" : "var(--amber)" }}
    >
      <span aria-hidden>{tone === "error" ? "●" : "▲"}</span>
      <small className="truncate text-xs">{children}</small>
    </span>
  );
}
