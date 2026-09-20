import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * The one strip every working surface wears.
 *
 * Three slots that never move: what this surface is *for* on the left, what it
 * is working on in the middle, what it currently reads on the right. Fixed
 * positions are the point — what you learn in the debugger holds in the
 * editor, and size alone orients nobody.
 *
 * Replaces three strips that did this job at three sizes: the editors' 30px
 * `EditorToolbar`, the debugger's hand-rolled row, and the scenario picker
 * above it.
 */
export function SurfaceToolbar({
  verbs,
  context,
  readout,
  className,
}: {
  verbs?: ReactNode;
  context?: ReactNode;
  readout?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "flex h-[44px] w-full shrink-0 items-center gap-2 border-b border-[var(--border-1)] bg-[var(--bg2)] px-2.5",
        className,
      )}
    >
      {/* Both groups may be empty — two surfaces genuinely have no verbs. The
          slots stay anyway, because they are a grid and not a suggestion. */}
      <div className="flex min-w-0 items-center gap-1.5">{verbs}</div>
      <div className="flex min-w-0 items-center gap-1.5">{context}</div>
      <div className="ml-auto flex shrink-0 items-center gap-1.5">{readout}</div>
    </section>
  );
}

const BUTTON_BASE =
  "inline-flex items-center gap-1.5 whitespace-nowrap border px-3 py-1.5 text-[13px] " +
  "transition-colors disabled:pointer-events-none disabled:opacity-40 " +
  "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]";

export function ToolbarButton({
  weight = "secondary",
  onClick,
  disabled,
  title,
  children,
}: {
  weight?: "primary" | "secondary";
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const button = (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        BUTTON_BASE,
        weight === "primary"
          ? "border-[var(--accent-2)] bg-[color-mix(in_srgb,var(--accent-1)_22%,transparent)] text-[var(--accent-2)] hover:bg-[color-mix(in_srgb,var(--accent-1)_32%,transparent)]"
          : "border-[var(--border-2)] hover:border-[var(--accent-2)]",
      )}
    >
      {children}
    </button>
  );

  if (!title) return button;

  // A disabled button fires no pointer events, so Radix never hears the enter
  // and the tooltip that would explain *why* it is disabled never opens. The
  // span is the listener.
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">{button}</span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{title}</TooltipContent>
    </Tooltip>
  );
}

/**
 * For the things that are not verbs — popping out a window, closing one,
 * saving the file. They keep their tooltip, and they leave the row of words.
 */
export function ToolbarIconButton({
  label,
  onClick,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex">
          <button
            type="button"
            aria-label={label}
            onClick={onClick}
            disabled={disabled}
            className={cn(
              BUTTON_BASE,
              "border-[var(--border-1)] px-2 text-[var(--dim)] hover:text-[var(--text)]",
            )}
          >
            {children}
          </button>
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

export function ToolbarDivider() {
  return (
    <span aria-hidden className="mx-1 h-[22px] w-px bg-[var(--border-1)]" />
  );
}

/**
 * The numbers a surface is currently reading, as one instrument rather than a
 * scatter of pills: one border, hairlines between the fields.
 */
export function ToolbarReadout({
  items,
}: {
  items: { label: string; value: string; tone?: "good" | "bad" }[];
}) {
  return (
    <span className="flex items-stretch border border-[var(--border-1)] font-mono text-[11px] text-[var(--dim)]">
      {items.map(({ label, value, tone }) => (
        <span
          key={label || value}
          className="border-l border-[var(--border-1)] px-2.5 py-1 first:border-l-0"
        >
          {label ? `${label} ` : ""}
          <span
            style={{
              color:
                tone === "bad"
                  ? "var(--mag)"
                  : tone === "good"
                    ? "var(--green)"
                    : "var(--text)",
            }}
          >
            {value}
          </span>
        </span>
      ))}
    </span>
  );
}

/**
 * A diagnostic in the strip. Colour never carries the state on its own — the
 * glyph says which it is even where the two hues are close, as they are in
 * Solaris.
 */
export function ToolbarDiagnostic({
  tone,
  children,
}: {
  tone: "error" | "warning";
  children: ReactNode;
}) {
  return (
    <span
      className="flex min-w-0 items-center gap-1 truncate text-xs"
      style={{ color: tone === "error" ? "var(--mag)" : "var(--amber)" }}
    >
      <span aria-hidden>{tone === "error" ? "●" : "▲"}</span>
      <span className="truncate">{children}</span>
    </span>
  );
}
