import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * The two kinds of surface in Studio.
 *
 * `hairline` is the working surface: a 1px box and nothing else, because the
 * dense views cannot afford decoration. `bracketed` is for home, dialogs and
 * empty states — the places people arrive at rather than work in. Its corner
 * brackets are the one decorative gesture the language allows, taken from
 * signum-sandbox: 14px, 2px, top-left and bottom-right only.
 */
export function Panel({
  variant = "hairline",
  className,
  children,
}: {
  variant?: "hairline" | "bracketed";
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative border border-[var(--border-2)]",
        variant === "bracketed" && "bg-[var(--panel)] backdrop-blur-[8px]",
        className,
      )}
    >
      {variant === "bracketed" && (
        <>
          <span
            aria-hidden
            className="pointer-events-none absolute -left-px -top-px h-[14px] w-[14px] border-l-2 border-t-2 border-[var(--accent-2)]"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute -bottom-px -right-px h-[14px] w-[14px] border-b-2 border-r-2 border-[var(--accent-2)]"
          />
        </>
      )}
      {children}
    </div>
  );
}

/**
 * The strip a panel wears when one surface holds several views.
 *
 * Equal-width buttons, because the views are peers and the strip doubles as
 * the panel's ruler. The count belongs here rather than in a heading above the
 * list: it is what tells you whether the view is worth opening.
 */
export function PanelTabs<T extends string>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { id: T; label: ReactNode }[];
  value: T;
  // `NoInfer`, so a `useState` setter passed straight in doesn't drag `T` up
  // to `string` through `SetStateAction`.
  onChange: (id: NoInfer<T>) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "flex shrink-0 border-b border-[var(--border-1)] text-xs",
        className,
      )}
    >
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          role="tab"
          type="button"
          aria-selected={value === id}
          onClick={() => onChange(id)}
          className={cn(
            "flex-1 px-2 py-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--ring)]",
            value === id
              ? "bg-[color-mix(in_srgb,var(--accent-1)_20%,transparent)] font-medium"
              : "opacity-70 hover:opacity-100",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
